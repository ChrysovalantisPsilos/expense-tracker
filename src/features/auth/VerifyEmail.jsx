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
import { RingMark } from '../../shared/ui/RingLoader.jsx'
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
      {/* One status block: waiting (continues by itself), or — after a
          reload or the 15-minute cutoff — a plain "log in" step. Always
          mounted, so screen readers hear the change. */}
      <Stack role="status" aria-live="polite" spacing={1} align="center" textAlign="center"
        bg="bg.subtle" borderRadius="xl" px={4} py={4} mt={-1}>
        {waiting ? (
          <>
            <HStack spacing={3}>
              <RingMark size={24} />
              <Text fontWeight="700" color="text.primary">Waiting for you to tap the link…</Text>
            </HStack>
            <Text fontSize="sm" color="text.muted">
              This page continues by itself once you do — on this or any other device.
            </Text>
          </>
        ) : (
          <>
            <Text fontWeight="700" color="text.primary">
              {gaveUp ? 'Still waiting?' : 'Tapped the link?'}
            </Text>
            <Text fontSize="sm" color="text.muted">Once you’ve confirmed, log in to continue.</Text>
            <Button mt={2} leftIcon={<LogIn size={16} />} onClick={() => navigate('/login')}>Log in</Button>
          </>
        )}
      </Stack>

      <Text fontSize="sm" textAlign="center" color="text.muted">
        No email? Check spam, then{' '}
        <Button variant="link" colorScheme="brand" size="sm" verticalAlign="baseline"
          isDisabled={cooldown > 0} onClick={resend}>
          {cooldown > 0 ? `resend in ${cooldown}s` : 'resend it'}
        </Button>
        {' '}or{' '}
        <Button variant="link" colorScheme="brand" size="sm" verticalAlign="baseline" onClick={changeEmail}>
          use a different email
        </Button>.
      </Text>
    </AuthLayout>
  )
}
