import { useState } from 'react'
import {
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Stack, Text, FormControl, FormLabel, Input, Button, Checkbox, useToast,
} from '@chakra-ui/react'
import { Users } from 'lucide-react'
import { copyText } from '../../shared/lib/clipboard.js'
import { Trans, useT } from '../../shared/lib/i18n/I18nProvider.jsx'
import ConfirmDialog from '../../shared/ui/ConfirmDialog.jsx'

// The group's confirmation dialogs (its forms are full pages).

// Delete confirm (type-to-confirm). While others are still in the group
// (`check` from groupDeleteCheck) it explains instead, with a way to the
// members list; delete_group refuses the same case on the server.
export function DeleteGroupModal({ group, check, isOpen, onClose, busy, onConfirm, onMembers }) {
  const t = useT('groups')
  const [text, setText] = useState('')
  const match = text.trim() === group.name
  if (!check.canDelete) {
    return (
      <ConfirmDialog isOpen={isOpen} onClose={onClose} onConfirm={onMembers}
        title={t('modals.deleteBlocked.title', { name: group.name })} cancelLabel={t('common:actions.close')}
        confirmLabel={t('modals.deleteBlocked.manage')} confirmIcon={<Users size={16} />}>
        <Stack spacing={3}>
          <Text color="text.muted">{t('modals.deleteBlocked.body')}</Text>
          {check.others.length > 0 && (
            <Text fontSize="sm">
              <Trans t={t} k="modals.deleteBlocked.stillIn" components={{ b: <b /> }}
                values={{ names: check.others.map((m) => m.display_name).join(', ') }} />
            </Text>
          )}
        </Stack>
      </ConfirmDialog>
    )
  }
  return (
    <ConfirmDialog isOpen={isOpen} onClose={onClose} onConfirm={onConfirm} busy={busy} disabled={!match} danger
      title={t('modals.delete.title', { name: group.name })} confirmLabel={t('header.delete')}>
      <Stack spacing={3}>
        <Text color="text.muted">
          <Trans t={t} k="modals.delete.body" components={{ b: <b /> }} />
        </Text>
        <FormControl>
          <FormLabel fontSize="sm">{t('modals.delete.confirm')}</FormLabel>
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={group.name} />
        </FormControl>
      </Stack>
    </ConfirmDialog>
  )
}

// Leave confirm; `onConfirm(silent)` — silent skips notifying the group.
export function LeaveGroupModal({ group, isOwner, isOpen, onClose, busy, onConfirm }) {
  const t = useT('groups')
  const [silent, setSilent] = useState(false)
  return (
    <ConfirmDialog isOpen={isOpen} onClose={onClose} onConfirm={() => onConfirm(silent)} busy={busy} danger
      title={t('modals.leave.title', { name: group.name })} confirmLabel={t('modals.leave.confirm')}>
      <Stack spacing={4}>
        <Text color="text.muted">{t(isOwner ? 'modals.leave.bodyOwner' : 'modals.leave.body')}</Text>
        <Checkbox isChecked={silent} onChange={(e) => setSilent(e.target.checked)}>
          <Text fontSize="sm">{t('modals.leave.silent')}</Text>
        </Checkbox>
      </Stack>
    </ConfirmDialog>
  )
}

// Remove-member confirm (owner only); `member` null = closed.
export function RemoveMemberModal({ member, onClose, busy, onConfirm }) {
  const t = useT('groups')
  return (
    <ConfirmDialog isOpen={!!member} onClose={onClose} onConfirm={onConfirm} busy={busy} danger
      title={t('modals.remove.title', { name: member?.display_name })} confirmLabel={t('modals.remove.confirm')}
      body={t('modals.remove.body')} />
  )
}

// The invite link, shown when the browser wouldn't copy it (or the email
// couldn't be sent): selectable in a field, with a fresh tap to copy or to
// open the share sheet — both work here because they run inside that tap.
export function InviteLinkModal({ link, onClose }) {
  const t = useT('groups')
  const toast = useToast()
  async function copy() {
    if (await copyText(link?.url)) {
      toast({ title: t('modals.invite.copied'), status: 'success' })
      onClose()
    } else {
      toast({ title: t('modals.invite.selectIt'), status: 'info' })
    }
  }
  async function share() {
    try {
      await navigator.share({ title: t('modals.invite.shareTitle'), url: link.url })
      onClose()
    } catch (e) {
      if (e?.name !== 'AbortError') copy()
    }
  }
  return (
    <Modal isOpen={!!link} onClose={onClose} isCentered>
      <ModalOverlay />
      <ModalContent mx={4}>
        <ModalHeader>{link?.title ?? t('modals.invite.title')}</ModalHeader>
        <ModalBody>
          <Text color="text.muted" mb={3}>{t('modals.invite.body')}</Text>
          <Input value={link?.url ?? ''} isReadOnly aria-label={t('modals.invite.field')}
            onFocus={(e) => e.target.select()} />
        </ModalBody>
        <ModalFooter gap={2}>
          {typeof navigator !== 'undefined' && navigator.share && (
            <Button variant="outline" onClick={share}>{t('actions.share')}</Button>
          )}
          <Button onClick={copy}>{t('modals.invite.copy')}</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
