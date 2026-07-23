import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Center, Card, CardBody, Stack, VStack, Flex, Heading, Text, Button,
  FormControl, FormLabel, Input,
} from '@chakra-ui/react'
import { MailCheck, ArrowLeft } from 'lucide-react'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import Logo from '../../shared/ui/Logo.jsx'

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
                    If an account exists for <b>{email.trim()}</b>, we’ve sent a
                    link to reset your password. Check spam if it’s not there.
                  </Text>
                </VStack>
              </VStack>
              <Button variant="outline" colorScheme="gray"
                leftIcon={<ArrowLeft size={16} />} onClick={() => navigate('/login')}>
                Back to sign in
              </Button>
            </Stack>
          </CardBody>
        </Card>
      </Center>
    )
  }

  return (
    <Center minH="100dvh" px={4}>
      <Card maxW="sm" w="full">
        <CardBody>
          <Stack spacing={6}>
            <VStack spacing={3}>
              <Logo size={40} />
              <VStack spacing={1} textAlign="center">
                <Heading size="md">Reset your password</Heading>
                <Text color="text.muted" fontSize="sm">
                  Enter your email and we’ll send you a reset link.
                </Text>
              </VStack>
            </VStack>

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
              Back to sign in
            </Button>
          </Stack>
        </CardBody>
      </Card>
    </Center>
  )
}
