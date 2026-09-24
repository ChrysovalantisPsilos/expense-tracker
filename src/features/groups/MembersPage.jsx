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
import Panel from '../../shared/ui/kit/Panel.jsx'
import UserAvatar from '../../shared/ui/UserAvatar.jsx'
import {
  createInvite, createInviteLink, emailInvite, inviteExistingUser, removeMember,
} from './groups.js'
import { pluralise, sortMembers } from './groupFormat.js'
import GroupFormPage from './GroupFormPage.jsx'
import { RemoveMemberModal } from './GroupModals.jsx'

// /groups/:id/members — who's in the group (you and the owner first, no
// balances: the group page's "Who owes whom" covers those), the owner's
// remove buttons (each confirmed in a small dialog), and inviting people by
// email or with a share link. Leaving is in the group page's ⋯ menu.
export default function MembersPage() {
  return (
    <GroupFormPage title="Members">
      {(ctx) => <Members {...ctx} />}
    </GroupFormPage>
  )
}

function Members({ group, members, myMember, isOwner, reload }) {
  const { user } = useAuth()
  const toast = useToast()
  const [removing, setRemoving] = useState(null)
  const { busy: removeBusy, run: runRemove } = useAsyncSubmit()

  async function doRemove() {
    const who = removing
    await runRemove(async () => {
      await removeMember(who.id)
      toast({ title: `Removed ${who.display_name}`, status: 'success' })
      setRemoving(null)
      reload() // live via realtime too; this covers a dropped socket
    }, { errorTitle: 'Couldn’t remove' })
  }

  async function copyInvite() {
    try {
      const url = await createInviteLink(group.id)
      await navigator.clipboard.writeText(url)
      toast({ title: 'Invite link copied', description: 'Paste it in a chat to invite friends.', status: 'success' })
    } catch (e) {
      console.error('[groups] invite link failed:', e)
      toast({ title: 'Could not create invite', description: userMessage(e), status: 'error' })
    }
  }

  return (
    <>
      <Panel icon={Users} title="In this group" subtitle={pluralise(members.length, 'member')}>
        <List spacing={0}>
          {sortMembers(members, user.id).map((m, i) => {
            const isMe = m.user_id === user.id
            return (
              <ListItem key={m.id}>
                {i > 0 && <Divider />}
                <HStack py={2.5} spacing={3} minH="56px">
                  <UserAvatar size="sm" name={m.display_name} src={m.avatar_url} highlight={isMe} />
                  <Text fontWeight={isMe ? '700' : '500'} minW={0} overflowWrap="anywhere">
                    {m.display_name}{isMe ? ' (you)' : ''}
                  </Text>
                  {m.role === 'owner' && <Badge colorScheme="brand" flexShrink={0}>Owner</Badge>}
                  {isOwner && !isMe && (
                    <IconButton aria-label={`Remove ${m.display_name}`} size="sm" variant="ghost"
                      ml="auto" flexShrink={0} color="status.negative" icon={<UserMinus size={16} />}
                      onClick={() => setRemoving(m)} />
                  )}
                </HStack>
              </ListItem>
            )
          })}
        </List>
      </Panel>

      {myMember && <InvitePanel group={group} onCopyLink={copyInvite} />}

      <RemoveMemberModal member={removing} onClose={() => setRemoving(null)}
        busy={removeBusy} onConfirm={doRemove} />
    </>
  )
}

const INVITE_STATUS_MESSAGE = {
  already_member: 'That person is already in this group.',
  already_invited: 'They already have a pending invite to this group.',
}

// Invite by email (an in-app request to an existing Budgeer user, else an
// emailed join link), or copy a share link. The field clears after each
// invite, so several people can be asked in a row.
function InvitePanel({ group, onCopyLink }) {
  const toast = useToast()
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
        toast({ title: `Request sent to ${addr}`, description: 'They’ll see it in Budgeer.', status: 'success' })
        setEmail('')
      } else if (status === 'no_account') {
        // No account yet — send an emailable join link.
        const { token, url } = await createInvite(group.id, { email: addr })
        try {
          await emailInvite({ to: addr, token })
          toast({ title: `Invite emailed to ${addr}`, status: 'success' })
        } catch (mailErr) {
          await navigator.clipboard.writeText(url)
          console.error('[groups] invite email failed:', mailErr)
          toast({ title: 'Couldn’t send the email — link copied instead',
            description: userMessage(mailErr), status: 'warning', duration: 8000 })
        }
        setEmail('')
      } else {
        toast({ title: INVITE_STATUS_MESSAGE[status] ?? 'Couldn’t send the invite.', status: 'error' })
      }
    })
  }

  return (
    <Panel icon={Mail} title="Invite people"
      subtitle="By email or a share link — they join once they accept.">
      <Stack as="form" spacing={3} onSubmit={submit} {...unsavedFormAttr(!!email.trim())}>
        <FormControl isRequired>
          <FormLabel>Email address</FormLabel>
          <Input type="email" value={email} autoComplete="email"
            onChange={(e) => setEmail(e.target.value)} placeholder="friend@example.com" />
          <FormHelperText>Someone already on Budgeer gets the invite in the app.</FormHelperText>
        </FormControl>
        <Stack direction={{ base: 'column-reverse', sm: 'row' }} spacing={3}>
          <Button variant="outline" leftIcon={<Link2 size={16} />} onClick={onCopyLink}>
            Copy invite link
          </Button>
          <Button type="submit" flex={{ sm: 1 }} leftIcon={<Mail size={16} />} isLoading={busy}>
            Send invite
          </Button>
        </Stack>
      </Stack>
    </Panel>
  )
}
