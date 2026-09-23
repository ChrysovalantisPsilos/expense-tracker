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
import { DELETION_SCOPE } from '../privacy/legal.js'

// The danger zone at the foot of Security: set apart by space and a red
// label, with the confirm-to-delete modal behind its button.
export default function DeleteAccount({ user }) {
  const { signOut } = useAuth()
  const deleteModal = useDisclosure()
  return (
    <Box pt={6}>
      <Eyebrow color="status.negative" mb={2}>Danger zone</Eyebrow>
      <Panel borderColor="status.negativeBorder" icon={AlertTriangle} iconTone="negative"
        title="Delete account">
        <Text fontSize="sm" color="text.muted" mb={4}>
          Permanently deletes your account and personal data. Shared group expenses
          stay for the other members under “Former member”. This can’t be undone.
        </Text>
        <Button colorScheme="red" variant="outline" leftIcon={<Trash2 size={16} />}
          onClick={deleteModal.onOpen}>Delete my account</Button>
      </Panel>

      <DeleteAccountModal user={user} isOpen={deleteModal.isOpen} onClose={deleteModal.onClose}
        signOut={signOut} />
    </Box>
  )
}

// Also offered by the legal prompt (privacy/LegalGate) to someone who doesn't
// accept updated terms.
export function DeleteAccountModal({ user, isOpen, onClose, signOut }) {
  const toast = useToast()
  // Require a password if the user has an email/password identity (default to
  // requiring it when we can't tell); otherwise ask for a typed phrase.
  const isPasswordUser = hasPasswordIdentity(user)
  const [value, setValue] = useState('')
  const { busy, run } = useAsyncSubmit()
  const inputRef = useRef(null)

  const canSubmit = isPasswordUser ? value.length > 0 : value.trim().toUpperCase() === 'DELETE'

  async function confirm() {
    if (!canSubmit) return
    await run(async () => {
      // The server re-verifies the password for password users, so pass it along.
      await deleteMyAccount(isPasswordUser ? { password: value } : {})
      toast({ title: 'Your account has been deleted', status: 'success' })
      await signOut() // App flips to the logged-out landing
    }, { errorTitle: 'Could not delete account' })
  }

  return (
    <FormModal isOpen={isOpen} onClose={onClose} title="Delete your account?" onSubmit={confirm}
      busy={busy} submitLabel="Delete account" initialFocusRef={inputRef}
      submitProps={{ colorScheme: 'red', isDisabled: !canSubmit }}>
      <Stack spacing={4}>
        <Text color="text.muted" fontSize="sm">
          This can’t be undone. You may want to download your data first
          (Settings → Privacy).
        </Text>
        <DeletionScope />
        <FormControl isRequired>
          <FormLabel>{isPasswordUser ? 'Enter your password to confirm'
            : 'Type DELETE to confirm'}</FormLabel>
          <Input ref={inputRef} type={isPasswordUser ? 'password' : 'text'} value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={isPasswordUser ? 'Your password' : 'DELETE'} />
        </FormControl>
      </Stack>
    </FormModal>
  )
}

// What deletion erases and what stays — DELETION_SCOPE, the same words the
// deletion confirmation email uses (_shared/accountDeletion.ts).
function DeletionScope() {
  return (
    <Stack spacing={2} fontSize="sm" color="text.muted">
      <Text fontWeight="600" color="text.primary">Deleted</Text>
      <UnorderedList spacing={1} pl={1}>
        {DELETION_SCOPE.deleted.map((line) => <ListItem key={line}>{line}</ListItem>)}
      </UnorderedList>
      <Text fontWeight="600" color="text.primary">Stays for your groups</Text>
      <UnorderedList spacing={1} pl={1}>
        {DELETION_SCOPE.stays.map((line) => <ListItem key={line}>{line}</ListItem>)}
      </UnorderedList>
    </Stack>
  )
}
