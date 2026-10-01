import { useState } from 'react'
import {
  Badge, Button, Divider, FormControl, FormHelperText, FormLabel, HStack, IconButton, Input,
  List, ListItem, Stack, Text, useToast,
} from '@chakra-ui/react'
import { Link2, Mail, UserMinus, Users } from 'lucide-react'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { useAsyncSubmit } from '../../shared/lib/useAsyncSubmit.js'
import { unsavedFormAttr } from '../../shared/lib/autoUpdate.js'
import { userMessage } from '../../shared/lib/errors.js'
import { copyText } from '../../shared/lib/clipboard.js'
import Panel from '../../shared/ui/kit/Panel.jsx'
import UserAvatar from '../../shared/ui/UserAvatar.jsx'
import {
  createInvite, createInviteLink, emailInvite, inviteExistingUser, removeMember,
} from './groups.js'
import { inviteRefusal, memberRowParts, pluralise } from './groupFormat.js'
import GroupFormPage from './GroupFormPage.jsx'
import { InviteLinkModal, RemoveMemberModal } from './GroupModals.jsx'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

// /groups/:id/members — who's in the group (you and the owner first, no
// balances: the group page's "Who owes whom" covers those), the owner's
// remove buttons (each confirmed in a small dialog), and inviting people by
// email or with a share link. Leaving is in the group page's ⋯ menu.
export default function MembersPage() {
  const t = useT('groups')
  return (
    <GroupFormPage title={t('members.title')}>
      {(ctx) => <Members {...ctx} />}
    </GroupFormPage>
  )
}

function Members({ group, members, myMember, isOwner, reload }) {
  const { user } = useAuth()
  const toast = useToast()
  const t = useT('groups')
  const [removing, setRemoving] = useState(null)
  const [shownLink, setShownLink] = useState(null)
  const { busy: removeBusy, run: runRemove } = useAsyncSubmit()

  async function doRemove() {
    const who = removing
    await runRemove(async () => {
      await removeMember(who.id)
      toast({ title: t('members.removed', { name: who.display_name }), status: 'success' })
      setRemoving(null)
      reload() // live via realtime too; this covers a dropped socket
    }, { errorTitle: t('members.removeFailed') })
  }

  // The copy starts inside the tap, before the link exists (copyText), so
  // Safari on iPhone allows it. If the browser still refuses, the link is
  // shown in a dialog to copy or share from there.
  async function copyInvite() {
    const link = createInviteLink(group.id)
    const copied = copyText(link)
    let url
    try {
      url = await link
    } catch (e) {
      console.error('[groups] invite link failed:', e)
      toast({ title: t('members.inviteFailed'), description: userMessage(e), status: 'error' })
      return
    }
    if (await copied) {
      toast({ title: t('modals.invite.copied'), description: t('members.linkCopiedHint'), status: 'success' })
    } else {
      setShownLink({ url })
    }
  }

  return (
    <>
      <Panel icon={Users} title={t('members.inGroup')} subtitle={pluralise(members.length, 'member')}>
        <List spacing={0}>
          {memberRowParts(members, user.id, isOwner).map((m, i) => (
            <ListItem key={m.id}>
              {i > 0 && <Divider />}
              <HStack py={2.5} spacing={3} minH="56px">
                <UserAvatar size="sm" name={m.name} src={m.src} highlight={m.highlight} />
                <Text fontWeight={m.isMe ? '700' : '500'} minW={0} overflowWrap="anywhere">{m.label}</Text>
                {m.owner && <Badge colorScheme="brand" flexShrink={0}>{m.owner}</Badge>}
                {m.canRemove && (
                  <IconButton aria-label={m.removeLabel} size="sm" variant="ghost"
                    ml="auto" flexShrink={0} color="status.negative" icon={<UserMinus size={16} />}
                    onClick={() => setRemoving(members.find((x) => x.id === m.id))} />
                )}
              </HStack>
            </ListItem>
          ))}
        </List>
      </Panel>

      {myMember && <InvitePanel group={group} onCopyLink={copyInvite} onShowLink={setShownLink} />}
      <InviteLinkModal link={shownLink} onClose={() => setShownLink(null)} />

      <RemoveMemberModal member={removing} onClose={() => setRemoving(null)}
        busy={removeBusy} onConfirm={doRemove} />
    </>
  )
}

// Invite by email (an in-app request to an existing Budgeer user, else an
// emailed join link), or copy a share link. The field clears after each
// invite, so several people can be asked in a row.
function InvitePanel({ group, onCopyLink, onShowLink }) {
  const toast = useToast()
  const t = useT('groups')
  const [email, setEmail] = useState('')
  const { busy, run } = useAsyncSubmit()

  async function submit(e) {
    e.preventDefault()
    const addr = email.trim()
    if (!addr) return
    await run(async () => {
      // First try to invite an existing Budgeer user (in-app request).
      const status = await inviteExistingUser(group.id, addr)
      if (status === 'invited') {
        toast({ title: t('members.requestSent', { email: addr }), description: t('members.requestSentHint'), status: 'success' })
        setEmail('')
      } else if (status === 'no_account') {
        // No account yet — send an emailable join link.
        const { token, url } = await createInvite(group.id, { email: addr })
        try {
          await emailInvite({ to: addr, token })
          toast({ title: t('members.emailed', { email: addr }), status: 'success' })
        } catch (mailErr) {
          // Too late in the tap to copy on iPhone: show the link to share instead.
          console.error('[groups] invite email failed:', mailErr)
          onShowLink({ url, title: t('members.emailFailed') })
        }
        setEmail('')
      } else {
        toast({ title: inviteRefusal(status), status: 'error' })
      }
    })
  }

  return (
    <Panel icon={Mail} title={t('members.invite.title')} subtitle={t('members.invite.subtitle')}>
      <Stack as="form" spacing={3} onSubmit={submit} {...unsavedFormAttr(!!email.trim())}>
        <FormControl isRequired>
          <FormLabel>{t('members.invite.email')}</FormLabel>
          <Input type="email" value={email} autoComplete="email"
            onChange={(e) => setEmail(e.target.value)} placeholder="friend@example.com" />
          <FormHelperText>{t('members.invite.emailHint')}</FormHelperText>
        </FormControl>
        <Stack direction={{ base: 'column-reverse', sm: 'row' }} spacing={3}>
          <Button variant="outline" leftIcon={<Link2 size={16} />} onClick={onCopyLink}>
            {t('members.invite.copyLink')}
          </Button>
          <Button type="submit" flex={{ sm: 1 }} leftIcon={<Mail size={16} />} isLoading={busy}>
            {t('members.invite.send')}
          </Button>
        </Stack>
      </Stack>
    </Panel>
  )
}
