import { useState } from 'react'
import {
  Stack, Text, Button, FormControl, FormLabel, FormHelperText,
  FormErrorMessage, Input, useDisclosure, useToast, Modal, ModalOverlay,
  ModalContent, ModalHeader, ModalBody, ModalFooter, ModalCloseButton,
} from '@chakra-ui/react'
import { Download, Info, Eye, KeyRound } from 'lucide-react'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { validatePassword } from '../../shared/lib/password.js'
import { saveErrorToast } from '../../shared/lib/saveError.js'
import Panel from '../../shared/ui/kit/Panel.jsx'
import { downloadBackup } from './backup.js'
import Note from './Note.jsx'
import { BusyNote, RingSpinner } from '../../shared/ui/RingLoader.jsx'

// "Export backup": one JSON file of everything personal, optionally locked
// with a password (encrypted in the browser before it's saved).
export default function ExportBackup() {
  const dialog = useDisclosure()
  return (
    <Panel title="Export backup" icon={Download}>
      <Text fontSize="sm" color="text.muted" mb={4}>
        Download one file with your expenses and income, categories and rules,
        budgets, recurring entries, accounts, savings goals, settings and payment
        details — plus a read-only record of your groups.
      </Text>
      <Button leftIcon={<Download size={16} />} onClick={dialog.onOpen}>Export backup</Button>
      {dialog.isOpen && <ExportDialog onClose={dialog.onClose} />}
    </Panel>
  )
}

function ExportDialog({ onClose }) {
  const { user } = useAuth()
  const toast = useToast()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [touched, setTouched] = useState(false)
  const [step, setStep] = useState(null) // progress label while exporting

  const pwError = password ? validatePassword(password) : null
  const mismatch = password && confirm !== password
  const canSubmit = !pwError && !mismatch

  async function submit(e) {
    e.preventDefault()
    setTouched(true)
    if (!canSubmit) return
    setStep('Starting')
    try {
      await downloadBackup(user.id, password || null, setStep)
      toast({ title: 'Backup downloaded', status: 'success',
        description: password ? 'Keep the password somewhere safe.' : undefined })
      onClose()
    } catch (err) {
      toast(saveErrorToast(err, 'Couldn’t export your data'))
      setStep(null)
    }
  }

  const busy = step !== null
  return (
    <Modal isOpen onClose={busy ? () => {} : onClose} isCentered scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent as="form" mx={4} onSubmit={submit}>
        <ModalHeader>Export backup</ModalHeader>
        {!busy && <ModalCloseButton />}
        <ModalBody>
          <Stack spacing={4}>
            <FormControl isInvalid={touched && !!pwError}>
              <FormLabel>Password (optional)</FormLabel>
              <Input type="password" value={password} autoComplete="new-password"
                onChange={(e) => setPassword(e.target.value)} isDisabled={busy}
                placeholder="Leave empty for no password" />
              {touched && pwError
                ? <FormErrorMessage>{pwError}</FormErrorMessage>
                : <FormHelperText>Encrypts the file on this device. Lose the password and the file can’t be restored.</FormHelperText>}
            </FormControl>
            {password && (
              <FormControl isInvalid={touched && mismatch}>
                <FormLabel>Confirm password</FormLabel>
                <Input type="password" value={confirm} autoComplete="new-password"
                  onChange={(e) => setConfirm(e.target.value)} isDisabled={busy} />
                <FormErrorMessage>The passwords don’t match.</FormErrorMessage>
              </FormControl>
            )}
            {password ? (
              <Note icon={KeyRound} tone="warning">
                If you lose this password, the backup can’t be restored. We don’t
                keep a copy and can’t recover it for you.
              </Note>
            ) : (
              <Note icon={Eye} tone="warning">
                Without a password, the file holds your data in readable form —
                anyone who gets the file can read it.
              </Note>
            )}
            <Note icon={Info}>
              Your photo isn’t included. Group history is a record for you to
              keep; restoring brings back your share of each group expense as a
              personal expense.
            </Note>
            {busy && <BusyNote>{step}…</BusyNote>}
          </Stack>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="ghost" onClick={onClose} isDisabled={busy}>Cancel</Button>
          <Button type="submit" leftIcon={<Download size={16} />} isLoading={busy}
            loadingText="Exporting" spinner={<RingSpinner />}>
            Download
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
