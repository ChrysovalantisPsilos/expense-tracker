import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Center, Card, CardBody, Stack, VStack, Flex, Heading, Text, Button, useToast,
} from '@chakra-ui/react'
import { MailCheck, LogIn } from 'lucide-react'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import Logo from '../../shared/ui/Logo.jsx'
import { STORAGE_KEYS } from '../../shared/lib/keys.js'

const PENDING_EMAIL = STORAGE_KEYS.pendingEmail
const RESEND_COOLDOWN = 60 // seconds

export default function VerifyEmail() {
  const navigate = useNavigate()
  const toast = useToast()
  const { resendConfirmation } = useAuth()
  const email = sessionStorage.getItem(PENDING_EMAIL) || ''
  const [cooldown, setCooldown] = useState(0)
  const timerRef = useRef(null)

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
      toast({ title: 'Couldn’t resend', description: error.message, status: 'error' })
      return
    }
    toast({ title: 'Confirmation email resent', status: 'success' })
    setCooldown(RESEND_COOLDOWN)
  }

  function changeEmail() {
    sessionStorage.removeItem(PENDING_EMAIL)
    navigate('/login?signup=1', { replace: true })
  }

  return (
    <Center minH="100dvh" px={4}>
      <Card maxW="sm" w="full">
        <CardBody>
          <Stack spacing={6}>
            <VStack spacing={4}>
              <Logo size={36} />
              <Flex boxSize="56px" align="center" justify="center" borderRadius="2xl"
                bg="bg.subtle" color="accent.fg"><MailCheck size={28} /></Flex>
              <VStack spacing={1} textAlign="center">
                <Heading size="md">Check your inbox</Heading>
                <Text color="text.muted">
                  We sent a confirmation link to
                </Text>
                <Text fontWeight="700">{email}</Text>
              </VStack>
              <Text fontSize="sm" color="text.muted" textAlign="center">
                Open it to confirm your account. If you open it on <b>this</b>{' '}
                device you’ll continue automatically. Confirmed on a different
                device? Just sign in below. Check spam if it’s not there.
              </Text>
            </VStack>

            <Stack spacing={3}>
              <Button variant="outline" colorScheme="gray"
                leftIcon={<LogIn size={16} />} onClick={() => navigate('/login')}>
                I’ve confirmed — sign in
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
          </Stack>
        </CardBody>
      </Card>
    </Center>
  )
}
