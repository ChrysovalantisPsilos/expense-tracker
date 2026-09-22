import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Stack, Button, FormControl, FormLabel, Input, FormHelperText, useToast,
} from '@chakra-ui/react'
import { KeyRound, AlertTriangle } from 'lucide-react'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { validatePassword } from '../../shared/lib/password.js'
import AuthLayout from './AuthLayout.jsx'

export default function ResetPassword() {
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
    if (password !== confirm) { toast({ title: 'Passwords don’t match.', status: 'warning' }); return }
    setBusy(true)
    const { error } = await updatePassword(password)
    setBusy(false)
    if (error) {
      toast({ title: error.message || 'Couldn’t update your password — the link may have expired.', status: 'error' })
      return
    }
    clearRecovery()
    toast({ title: 'Password updated', status: 'success' })
    navigate('/', { replace: true })
  }

  if (!canReset) {
    return (
      <AuthLayout icon={<AlertTriangle size={28} />} iconColor="status.warning"
        title="Link expired or invalid"
        subtitle={<>
          This password-reset link isn’t valid anymore. Reset links are
          single-use and expire after a while — request a fresh one.
        </>}>
        <Button onClick={() => navigate('/forgot-password')}>Request a new link</Button>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout icon={<KeyRound size={28} />} title="Choose a new password"
      showHome={!recovering}>
      <form onSubmit={handleSubmit}>
        <Stack spacing={4}>
          <FormControl isRequired>
            <FormLabel>New password</FormLabel>
            <Input type="password" autoComplete="new-password" value={password}
              onChange={(e) => setPassword(e.target.value)} />
            <FormHelperText>At least 8 characters, with a letter and a number.</FormHelperText>
          </FormControl>
          <FormControl isRequired>
            <FormLabel>Confirm new password</FormLabel>
            <Input type="password" autoComplete="new-password" value={confirm}
              onChange={(e) => setConfirm(e.target.value)} />
          </FormControl>
          <Button type="submit" isLoading={busy} w="full">
            Update password
          </Button>
        </Stack>
      </form>
    </AuthLayout>
  )
}
