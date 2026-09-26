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
import { hasPasswordIdentity } from './authMethods.js'
import { useRecentSignIn } from './useRecentSignIn.js'
import ReauthNotice from './ReauthNotice.jsx'
import { DELETION_SCOPE } from '../privacy/legal.js'
import { RingSpinner } from '../../shared/ui/RingLoader.jsx'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

// What a user without a password types to confirm (checked as typed, in
// every language).
const CONFIRM_WORD = 'DELETE'

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
  // Require a password if the user has an email/password identity (default to
  // requiring it when we can't tell); otherwise a recent sign-in (the server
  // checks it too, _shared/reauth.ts) and a typed phrase.
  const isPasswordUser = hasPasswordIdentity(user)
  const recent = useRecentSignIn()
  const needsReauth = !isPasswordUser && !recent
  const [value, setValue] = useState('')
  const { busy, run } = useAsyncSubmit()
  const inputRef = useRef(null)

  const canSubmit = isPasswordUser ? value.length > 0 : !needsReauth && value.trim().toUpperCase() === CONFIRM_WORD

  async function confirm() {
    if (!canSubmit) return
    await run(async () => {
      // The server re-verifies the password for password users, so pass it along.
      await deleteMyAccount(isPasswordUser ? { password: value } : {})
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
            <FormLabel>{isPasswordUser ? t('deleteAccount.passwordLabel') : t('deleteAccount.typeLabel')}</FormLabel>
            <Input ref={inputRef} type={isPasswordUser ? 'password' : 'text'} value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={isPasswordUser ? t('deleteAccount.passwordPlaceholder') : CONFIRM_WORD} />
          </FormControl>
        )}
      </Stack>
    </FormModal>
  )
}

// What deletion erases and what stays — DELETION_SCOPE, the same words the
// deletion confirmation email uses (_shared/accountDeletion.ts).
function DeletionScope() {
  const t = useT('settings')
  return (
    <Stack spacing={2} fontSize="sm" color="text.muted">
      <Text fontWeight="600" color="text.primary">{t('deleteAccount.deletedList')}</Text>
      <UnorderedList spacing={1} pl={1}>
        {DELETION_SCOPE.deleted.map((line) => <ListItem key={line}>{line}</ListItem>)}
      </UnorderedList>
      <Text fontWeight="600" color="text.primary">{t('deleteAccount.staysList')}</Text>
      <UnorderedList spacing={1} pl={1}>
        {DELETION_SCOPE.stays.map((line) => <ListItem key={line}>{line}</ListItem>)}
      </UnorderedList>
    </Stack>
  )
}
