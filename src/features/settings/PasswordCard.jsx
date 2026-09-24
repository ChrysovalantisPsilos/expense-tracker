import { useState } from 'react'
import {
  Stack, FormControl, FormLabel, Input, Text, Button, useToast,
} from '@chakra-ui/react'
import { KeyRound } from 'lucide-react'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { validatePassword } from '../../shared/lib/password.js'
import Panel from '../../shared/ui/kit/Panel.jsx'
import { hasPassword } from './authMethods.js'
import { userMessage } from '../../shared/lib/errors.js'

// Change password for accounts that have one (an email identity, or a Google
// account that set one). A Google-only account has none to change, so this
// hides itself; the sign-in methods card offers "Set a password" instead.
export default function PasswordCard({ user }) {
  const toast = useToast()
  const { changePassword } = useAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)

  if (!hasPassword(user)) return null

  async function submit(e) {
    e.preventDefault()
    const err = validatePassword(next)
    if (err) { toast({ title: err, status: 'warning' }); return }
    if (next !== confirm) { toast({ title: 'New passwords don’t match.', status: 'warning' }); return }
    setBusy(true)
    try {
      // AuthProvider re-verifies the current password (and so does the server).
      const { error } = await changePassword(current, next)
      if (error) {
        console.error('[settings] password change failed:', error)
        toast({ title: userMessage(error, 'Couldn’t update your password. Please try again.'), status: 'error' })
        return
      }

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
