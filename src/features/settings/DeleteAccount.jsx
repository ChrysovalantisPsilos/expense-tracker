import { useState, useRef } from 'react'
import {
  Box, Stack, Text, Button, FormControl,
  FormLabel, Input, ListItem, UnorderedList, useDisclosure, useToast,
} from '@chakra-ui/react'
import { AlertTriangle, Trash2 } from 'lucide-react'
import { deleteMyAccount } from '../../shared/lib/profile.js'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import Eyebrow from '../../shared/ui/Eyebrow.jsx'
import Panel from '../../shared/ui/kit/Panel.jsx'
import FormModal from '../../shared/ui/FormModal.jsx'
import { useAsyncSubmit } from '../../shared/lib/useAsyncSubmit.js'
import { deleteAccountCheck, deletionScope } from './authMethods.js'
import { useRecentSignIn } from './useRecentSignIn.js'
import ReauthNotice from './ReauthNotice.jsx'
import { RingSpinner } from '../../shared/ui/RingLoader.jsx'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

// The danger zone at the foot of Security: set apart by space and a red
// label, with the confirm-to-delete modal behind its button.
export default function DeleteAccount({ user }) {
  const t = useT('settings')
  const { signOut } = useAuth()
  const deleteModal = useDisclosure()
  return (
    <Box pt={6}>
      <Eyebrow color="status.negative" mb={2}>{t('deleteAccount.dangerZone')}</Eyebrow>
      <Panel borderColor="status.negativeBorder" icon={AlertTriangle} iconTone="negative"
        title={t('deleteAccount.title')}>
        <Text fontSize="sm" color="text.muted" mb={4}>{t('deleteAccount.lead')}</Text>
        <Button colorScheme="red" variant="outline" leftIcon={<Trash2 size={16} />}
          onClick={deleteModal.onOpen}>{t('deleteAccount.open')}</Button>
      </Panel>

      <DeleteAccountModal user={user} isOpen={deleteModal.isOpen} onClose={deleteModal.onClose}
        signOut={signOut} />
    </Box>
  )
}

// Also offered by the legal prompt (privacy/LegalGate) to someone who doesn't
// accept updated terms.
export function DeleteAccountModal({ user, isOpen, onClose, signOut }) {
  const t = useT('settings')
  const toast = useToast()
  // A password if the user has an email/password identity (the stricter
  // path when we can't tell); otherwise a recent sign-in and a typed word
  // (deleteAccountCheck).
  const recent = useRecentSignIn()
  const [value, setValue] = useState('')
  const { busy, run } = useAsyncSubmit()
  const inputRef = useRef(null)
  const check = deleteAccountCheck({ user, recent, value })
  const { canSubmit, needsReauth } = check

  async function confirm() {
    if (!canSubmit) return
    await run(async () => {
      // The server re-verifies the password for password users, so pass it along.
      await deleteMyAccount(check.password ? { password: value } : {})
      toast({ title: t('deleteAccount.done'), status: 'success' })
      await signOut() // App flips to the logged-out landing
    }, { errorTitle: t('deleteAccount.failed') })
  }

  return (
    <FormModal isOpen={isOpen} onClose={onClose} title={t('deleteAccount.confirmTitle')} onSubmit={confirm}
      busy={busy} submitLabel={t('deleteAccount.submit')} initialFocusRef={inputRef}
      submitProps={{
        colorScheme: 'red', isDisabled: !canSubmit, loadingText: t('deleteAccount.deleting'), spinner: <RingSpinner />,
      }}>
      <Stack spacing={4}>
        <Text color="text.muted" fontSize="sm">{t('deleteAccount.warning')}</Text>
        <DeletionScope />
        {needsReauth ? <ReauthNotice reason="deleteAccount" /> : (
          <FormControl isRequired>
            <FormLabel>{check.label}</FormLabel>
            <Input ref={inputRef} type={check.password ? 'password' : 'text'} value={value}
              onChange={(e) => setValue(e.target.value)} placeholder={check.placeholder} />
          </FormControl>
        )}
      </Stack>
    </FormModal>
  )
}

// What deletion erases and what stays — the same words as the deletion
// confirmation email (deletionScope).
function DeletionScope() {
  const t = useT('settings')
  const scope = deletionScope()
  return (
    <Stack spacing={2} fontSize="sm" color="text.muted">
      <Text fontWeight="600" color="text.primary">{t('deleteAccount.deletedList')}</Text>
      <UnorderedList spacing={1} pl={1}>
        {scope.deleted.map((line) => <ListItem key={line}>{line}</ListItem>)}
      </UnorderedList>
      <Text fontWeight="600" color="text.primary">{t('deleteAccount.staysList')}</Text>
      <UnorderedList spacing={1} pl={1}>
        {scope.stays.map((line) => <ListItem key={line}>{line}</ListItem>)}
      </UnorderedList>
    </Stack>
  )
}
