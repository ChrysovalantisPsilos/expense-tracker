import { useState } from 'react'
import {
  Stack, FormControl, FormLabel, Input, Text, Button, useToast,
} from '@chakra-ui/react'
import { KeyRound } from 'lucide-react'
import { supabase } from '../../shared/lib/supabase.js'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { validatePassword } from '../../shared/lib/password.js'
import Panel from '../../shared/ui/kit/Panel.jsx'
import { hasPasswordIdentity } from './authMethods.js'

// Change password for accounts that already have a password (email identity).
// Google/passkey-only accounts have no password to change, so this hides itself.
export default function PasswordCard({ user }) {
  const toast = useToast()
  const { updatePassword } = useAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)

  if (!hasPasswordIdentity(user)) return null

  async function submit(e) {
    e.preventDefault()
    const err = validatePassword(next)
    if (err) { toast({ title: err, status: 'warning' }); return }
    if (next !== confirm) { toast({ title: 'New passwords don’t match.', status: 'warning' }); return }
    setBusy(true)
    try {
      // Re-verify the current password before changing it, so a left-open
      // session can't silently swap the password. signInWithPassword only
      // re-issues a token for the same user — it doesn't sign anyone out.
      const { error: authErr } = await supabase.auth.signInWithPassword({
        email: user.email, password: current,
      })
      if (authErr) { toast({ title: 'Current password is incorrect.', status: 'error' }); return }

      const { error } = await updatePassword(next)
      if (error) { toast({ title: error.message, status: 'error' }); return }

      setCurrent(''); setNext(''); setConfirm('')
      toast({ title: 'Password updated', status: 'success' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title="Password" icon={KeyRound}>
      <form onSubmit={submit}>
        <Stack spacing={3} maxW="sm">
          <FormControl isRequired>
            <FormLabel>Current password</FormLabel>
            <Input type="password" autoComplete="current-password" value={current}
              onChange={(e) => setCurrent(e.target.value)} />
          </FormControl>
          <FormControl isRequired>
            <FormLabel>New password</FormLabel>
            <Input type="password" autoComplete="new-password" value={next}
              onChange={(e) => setNext(e.target.value)} />
            <Text fontSize="xs" color="text.muted" mt={1}>
              At least 8 characters, with a letter and a number.
            </Text>
          </FormControl>
          <FormControl isRequired>
            <FormLabel>Confirm new password</FormLabel>
            <Input type="password" autoComplete="new-password" value={confirm}
              onChange={(e) => setConfirm(e.target.value)} />
          </FormControl>
          <Button type="submit" alignSelf="start" isLoading={busy}
            isDisabled={!current || !next || !confirm}>
            Update password
          </Button>
        </Stack>
      </form>
    </Panel>
  )
}
