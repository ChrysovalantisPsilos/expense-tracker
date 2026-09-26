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
import { Trans, useT } from '../../shared/lib/i18n/I18nProvider.jsx'

const PENDING_EMAIL = STORAGE_KEYS.pendingEmail
const RESEND_COOLDOWN = 60 // seconds

export default function VerifyEmail() {
  const t = useT('auth')
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
      toast({ title: t('verify.resendFailed'), description: userMessage(error), status: 'error' })
      return
    }
    toast({ title: t('verify.resent'), status: 'success' })
    setCooldown(RESEND_COOLDOWN)
  }

  function changeEmail() {
    wait.stop()
    sessionStorage.removeItem(PENDING_EMAIL)
    navigate('/login?signup=1', { replace: true })
  }

  return (
    <AuthLayout icon={<MailCheck size={28} />} title={t('verify.title')}
      subtitle={<>
        {t('verify.sentTo')}
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
              <Text fontWeight="700" color="text.primary">{t('verify.waiting')}</Text>
            </HStack>
            <Text fontSize="sm" color="text.muted">{t('verify.waitingBody')}</Text>
          </>
        ) : (
          <>
            <Text fontWeight="700" color="text.primary">
              {gaveUp ? t('verify.stillWaiting') : t('verify.tapped')}
            </Text>
            <Text fontSize="sm" color="text.muted">{t('verify.logInBody')}</Text>
            <Button mt={2} leftIcon={<LogIn size={16} />} onClick={() => navigate('/login')}>
              {t('common:actions.logIn')}
            </Button>
          </>
        )}
      </Stack>

      <Text fontSize="sm" textAlign="center" color="text.muted">
        <Trans t={t} k="verify.noEmail" components={{
          resend: (
            <Button variant="link" colorScheme="brand" size="sm" verticalAlign="baseline"
              isDisabled={cooldown > 0} onClick={resend}>
              {cooldown > 0 ? t('verify.resendIn', { seconds: cooldown }) : t('verify.resend')}
            </Button>
          ),
          change: <Button variant="link" colorScheme="brand" size="sm" verticalAlign="baseline" onClick={changeEmail} />,
        }} />
      </Text>
    </AuthLayout>
  )
}
