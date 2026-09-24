import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Stack, Button, FormControl, FormLabel, Input,
} from '@chakra-ui/react'
import { MailCheck, ArrowLeft } from 'lucide-react'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import AuthLayout from './AuthLayout.jsx'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function ForgotPassword() {
  const navigate = useNavigate()
  const { sendPasswordReset } = useAuth()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!EMAIL_RE.test(email.trim())) return
    setBusy(true)
    // Fire and forget: Supabase returns success whether or not the address is
    // registered, and we always show the same confirmation, so a submitter can
    // never learn which emails have accounts.
    await sendPasswordReset(email.trim())
    setBusy(false)
    setSent(true)
  }

  if (sent) {
    return (
      <AuthLayout icon={<MailCheck size={28} />} title="Check your inbox"
        subtitle={<>
          If an account exists for <b>{email.trim()}</b>, we’ve sent a
          link to reset your password. Check spam if it’s not there.
        </>}>
        <Button variant="outline" colorScheme="gray"
          leftIcon={<ArrowLeft size={16} />} onClick={() => navigate('/login')}>
          Back to log in
        </Button>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Reset your password"
      subtitle="Enter your email and we’ll send you a reset link.">
      <form onSubmit={handleSubmit}>
        <Stack spacing={4}>
          <FormControl isRequired>
            <FormLabel>Email</FormLabel>
            <Input type="email" autoComplete="email" value={email}
              onChange={(e) => setEmail(e.target.value)} />
          </FormControl>
          <Button type="submit" isLoading={busy} w="full"
            isDisabled={!EMAIL_RE.test(email.trim())}>
            Send reset link
          </Button>
        </Stack>
      </form>

      <Button variant="link" colorScheme="brand" size="sm"
        leftIcon={<ArrowLeft size={14} />} onClick={() => navigate('/login')}>
        Back to log in
      </Button>
    </AuthLayout>
  )
}
