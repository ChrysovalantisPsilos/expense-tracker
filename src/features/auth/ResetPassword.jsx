import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Stack, Button, FormControl, FormLabel, Input, FormHelperText, useToast,
} from '@chakra-ui/react'
import { KeyRound } from 'lucide-react'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { validatePassword } from '../../shared/lib/password.js'
import AuthLayout from './AuthLayout.jsx'
import LinkExpired from './LinkExpired.jsx'
import { userMessage } from '../../shared/lib/errors.js'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

export default function ResetPassword() {
  const t = useT('auth')
  const navigate = useNavigate()
  const toast = useToast()
  const { session, recovering, updatePassword, clearRecovery } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)

  // The recovery link establishes a session (and flips `recovering`). If neither
  // is present, the link was never opened here, or it expired/was already used.
  const canReset = recovering || !!session

  async function handleSubmit(e) {
    e.preventDefault()
    const err = validatePassword(password)
    if (err) { toast({ title: err, status: 'warning' }); return }
    if (password !== confirm) { toast({ title: t('password.mismatch'), status: 'warning' }); return }
    setBusy(true)
    const { error } = await updatePassword(password)
    setBusy(false)
    if (error) {
      console.error('[auth] password update failed:', error)
      toast({ title: userMessage(error, t('reset.failed')), status: 'error' })
      return
    }
    clearRecovery()
    toast({ title: t('password.updated'), status: 'success' })
    navigate('/', { replace: true })
  }

  if (!canReset) return <LinkExpired type="recovery" />

  return (
    <AuthLayout icon={<KeyRound size={28} />} title={t('reset.title')}
      showHome={!recovering}>
      <form onSubmit={handleSubmit}>
        <Stack spacing={4}>
          <FormControl isRequired>
            <FormLabel>{t('password.new')}</FormLabel>
            <Input type="password" autoComplete="new-password" value={password}
              onChange={(e) => setPassword(e.target.value)} />
            <FormHelperText>{t('password.hint')}</FormHelperText>
          </FormControl>
          <FormControl isRequired>
            <FormLabel>{t('password.confirmNew')}</FormLabel>
            <Input type="password" autoComplete="new-password" value={confirm}
              onChange={(e) => setConfirm(e.target.value)} />
          </FormControl>
          <Button type="submit" isLoading={busy} w="full">
            {t('password.update')}
          </Button>
        </Stack>
      </form>
    </AuthLayout>
  )
}
