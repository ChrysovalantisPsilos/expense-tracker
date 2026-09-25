import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  HStack, Stack, Text, Button, useToast,
} from '@chakra-ui/react'
import { MailCheck, LogIn } from 'lucide-react'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { STORAGE_KEYS } from '../../shared/lib/keys.js'
import AuthLayout from './AuthLayout.jsx'
import { userMessage } from '../../shared/lib/errors.js'
import { RingSpinner } from '../../shared/ui/RingLoader.jsx'
import { useConfirmWait } from './useConfirmWait.js'

const PENDING_EMAIL = STORAGE_KEYS.pendingEmail
const RESEND_COOLDOWN = 60 // seconds

export default function VerifyEmail() {
  const navigate = useNavigate()
  const toast = useToast()
  const { resendConfirmation, holdPendingSignIn } = useAuth()
  const email = sessionStorage.getItem(PENDING_EMAIL) || ''
  const [cooldown, setCooldown] = useState(0)
  const timerRef = useRef(null)
  // Signs in by itself once the link is opened, here or on another device
  // (not after a reload: the password lived only in memory).
  const wait = useConfirmWait(holdPendingSignIn)
  const waiting = wait.status === 'waiting' || wait.status === 'done'
  const gaveUp = wait.status === 'timedOut' || wait.status === 'failed'

  // If someone lands here without a pending signup, send them to login.
  useEffect(() => {
    if (!email) navigate('/login', { replace: true })
  }, [email, navigate])

  useEffect(() => {
    if (cooldown <= 0) return
    timerRef.current = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(timerRef.current)
  }, [cooldown])

  async function resend() {
    const { error } = await resendConfirmation(email)
    if (error) {
      console.error('[auth] resend failed:', error)
      toast({ title: 'Couldn’t resend', description: userMessage(error), status: 'error' })
      return
    }
    toast({ title: 'Confirmation email resent', status: 'success' })
    setCooldown(RESEND_COOLDOWN)
  }

  function changeEmail() {
    wait.stop()
    sessionStorage.removeItem(PENDING_EMAIL)
    navigate('/login?signup=1', { replace: true })
  }

  return (
    <AuthLayout icon={<MailCheck size={28} />} title="Check your inbox"
      subtitle={<>
        We sent a confirmation link to
        <Text as="span" display="block" fontWeight="700" color="text.primary"
          overflowWrap="anywhere">{email}</Text>
      </>}>
      <Stack spacing={3} mt={-2} fontSize="sm" color="text.muted" textAlign="center">
        <Text>
          {wait.status === 'idle'
            ? 'Tap the link in it to confirm your account, then log in below.'
            : 'Tap the link in it to confirm your account. This page continues by itself once you do, on any device.'}
          {' '}Check spam if it’s not there.
        </Text>
        {/* Always mounted, so screen readers hear the change. */}
        <Text as="div" role="status" aria-live="polite" _empty={{ display: 'none' }}>
          {waiting && (
            <HStack as="span" spacing={2} justify="center">
              <RingSpinner />
              <span>Waiting for you to confirm…</span>
            </HStack>
          )}
          {gaveUp && 'Still waiting? Log in once you’ve confirmed.'}
        </Text>
      </Stack>

      <Stack spacing={3}>
        <Button variant="outline" colorScheme="gray"
          leftIcon={<LogIn size={16} />} onClick={() => navigate('/login')}>
          I’ve confirmed — log in
        </Button>
        <Button variant="ghost" isDisabled={cooldown > 0} onClick={resend}>
          {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend email'}
        </Button>
      </Stack>

      <Text fontSize="sm" textAlign="center" color="text.muted">
        Wrong email?{' '}
        <Button variant="link" colorScheme="brand" size="sm" onClick={changeEmail}>
          Start over
        </Button>
      </Text>
    </AuthLayout>
  )
}
