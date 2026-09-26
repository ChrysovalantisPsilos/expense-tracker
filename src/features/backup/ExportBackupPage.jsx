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
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

// /settings/data/export — download one JSON file of everything personal,
// optionally locked with a password (encrypted in the browser before it's
// saved). Back is held while the file is being made; once it's downloaded
// the page goes back to Your data.
export default function ExportBackupPage() {
  const t = useT('backup')
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
    setStep(t('export.steps.starting'))
    try {
      await downloadBackup(user.id, password || null, setStep)
      toast({ title: t('export.done'), status: 'success',
        description: password ? t('export.keepSafe') : undefined })
      back()
    } catch (err) {
      toast(saveErrorToast(err, t('export.failed')))
      setStep(null)
    }
  }

  const busy = step !== null
  return (
    <FormPage eyebrow={t('settings:rows.data.label')} title={t('export.title')} fallback="/settings/data"
      backDisabled={busy} description={t('export.description')}>
      <PageForm onSubmit={submit} busy={busy} unsaved={busy} submitLabel={t('export.download')}
        submitProps={{ leftIcon: <Download size={16} />, loadingText: t('export.exporting'), spinner: <RingSpinner /> }}>
        <Stack spacing={4}>
          <FormControl isInvalid={touched && !!pwError}>
            <FormLabel>{t('export.passwordLabel')}</FormLabel>
            <Input type="password" value={password} autoComplete="new-password"
              onChange={(e) => setPassword(e.target.value)} isDisabled={busy}
              placeholder={t('export.passwordPlaceholder')} />
            {touched && pwError
              ? <FormErrorMessage>{pwError}</FormErrorMessage>
              : <FormHelperText>{t('export.passwordHelp')}</FormHelperText>}
          </FormControl>
          {password && (
            <FormControl isInvalid={touched && mismatch}>
              <FormLabel>{t('auth:password.confirm')}</FormLabel>
              <Input type="password" value={confirm} autoComplete="new-password"
                onChange={(e) => setConfirm(e.target.value)} isDisabled={busy} />
              <FormErrorMessage>{t('export.mismatch')}</FormErrorMessage>
            </FormControl>
          )}
          {password ? (
            <Note icon={KeyRound} tone="warning">{t('export.lostWarning')}</Note>
          ) : (
            <Note icon={Eye} tone="warning">{t('export.plainWarning')}</Note>
          )}
          <Note icon={Info}>{t('export.groupsNote')}</Note>
          {busy && <BusyNote>{step}…</BusyNote>}
        </Stack>
      </PageForm>
    </FormPage>
  )
}
