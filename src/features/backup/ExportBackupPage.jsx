import { useState } from 'react'
import {
  Stack, FormControl, FormLabel, FormHelperText, FormErrorMessage, Input, useToast,
} from '@chakra-ui/react'
import { Download, Info, Eye, KeyRound } from 'lucide-react'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { validatePassword } from '../../shared/lib/password.js'
import { saveErrorToast } from '../../shared/lib/saveError.js'
import FormPage, { PageForm } from '../../shared/ui/FormPage.jsx'
import useGoBack from '../../shared/ui/useGoBack.js'
import { downloadBackup } from './backup.js'
import Note from './Note.jsx'
import { BusyNote, RingSpinner } from '../../shared/ui/RingLoader.jsx'

// /settings/data/export — download one JSON file of everything personal,
// optionally locked with a password (encrypted in the browser before it's
// saved). Back is held while the file is being made; once it's downloaded
// the page goes back to Your data.
export default function ExportBackupPage() {
  const { user } = useAuth()
  const toast = useToast()
  const back = useGoBack('/settings/data')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [touched, setTouched] = useState(false)
  const [step, setStep] = useState(null) // progress label while exporting

  const pwError = password ? validatePassword(password) : null
  const mismatch = password && confirm !== password
  const canSubmit = !pwError && !mismatch

  async function submit() {
    setTouched(true)
    if (!canSubmit) return
    setStep('Starting')
    try {
      await downloadBackup(user.id, password || null, setStep)
      toast({ title: 'Backup downloaded', status: 'success',
        description: password ? 'Keep the password somewhere safe.' : undefined })
      back()
    } catch (err) {
      toast(saveErrorToast(err, 'Couldn’t export your data'))
      setStep(null)
    }
  }

  const busy = step !== null
  return (
    <FormPage eyebrow="Your data" title="Export backup" fallback="/settings/data" backDisabled={busy}
      description="One file of everything personal, optionally locked with a password.">
      <PageForm onSubmit={submit} busy={busy} unsaved={busy} submitLabel="Download"
        submitProps={{ leftIcon: <Download size={16} />, loadingText: 'Exporting', spinner: <RingSpinner /> }}>
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
      </PageForm>
    </FormPage>
  )
}
