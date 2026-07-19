import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box, Button, Card, CardBody, Center, Divider, FormControl, FormLabel,
  Input, Stack, Text, useToast, HStack, VStack, Icon,
} from '@chakra-ui/react'
import { useAuth } from '../auth/AuthProvider.jsx'
import { isSupabaseConfigured } from '../lib/supabase.js'
import Logo from '../components/Logo.jsx'

export default function Login() {
  const { signInWithPassword, signUp, signInWithProvider } = useAuth()
  const [mode, setMode] = useState('signin') // 'signin' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    const fn = mode === 'signin' ? signInWithPassword : signUp
    const { error } = await fn(email, password)
    setBusy(false)
    if (error) {
      toast({ title: error.message, status: 'error' })
      return
    }
    if (mode === 'signup') {
      toast({ title: 'Check your email to confirm your account.', status: 'info' })
    } else {
      navigate('/')
    }
  }

  return (
    <Center minH="100dvh" px={4}>
      <Card maxW="sm" w="full">
        <CardBody>
          <Stack spacing={6}>
            <VStack spacing={3}>
              <Logo size={40} />
              <Text color="text.muted">
                {mode === 'signin' ? 'Welcome back' : 'Create your account'}
              </Text>
            </VStack>

            {!isSupabaseConfigured && (
              <Text fontSize="sm" color="orange.400" textAlign="center">
                Supabase isn’t configured yet — set VITE_SUPABASE_URL and
                VITE_SUPABASE_ANON_KEY in .env.
              </Text>
            )}

            <form onSubmit={handleSubmit}>
              <Stack spacing={4}>
                <FormControl isRequired>
                  <FormLabel>Email</FormLabel>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </FormControl>
                <FormControl isRequired>
                  <FormLabel>Password</FormLabel>
                  <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                </FormControl>
                <Button type="submit" isLoading={busy} w="full">
                  {mode === 'signin' ? 'Sign in' : 'Sign up'}
                </Button>
              </Stack>
            </form>

            <HStack>
              <Divider />
              <Text fontSize="xs" color="text.muted" whiteSpace="nowrap">or continue with</Text>
              <Divider />
            </HStack>

            <Stack spacing={3}>
              <Button variant="outline" colorScheme="gray" onClick={() => signInWithProvider('google')}>
                <Icon viewBox="0 0 24 24" mr={2} boxSize={4}>
                  <path fill="currentColor" d="M21.35 11.1H12v2.98h5.35c-.23 1.4-1.6 4.1-5.35 4.1a5.19 5.19 0 1 1 0-10.38c1.48 0 2.47.63 3.04 1.17l2.07-2A8 8 0 1 0 12 20c4.62 0 7.67-3.25 7.67-7.82 0-.53-.06-.93-.14-1.08Z" />
                </Icon>
                Google
              </Button>
              {/* Apple sign-in requires a paid Apple Developer account + provider
                  setup in Supabase Auth. Enable once configured. */}
              <Button variant="outline" colorScheme="gray" isDisabled onClick={() => signInWithProvider('apple')}>
                Apple (setup required)
              </Button>
            </Stack>

            <Text fontSize="sm" textAlign="center" color="text.muted">
              {mode === 'signin' ? "Don't have an account? " : 'Already have one? '}
              <Button variant="link" colorScheme="brand" size="sm"
                onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
                {mode === 'signin' ? 'Sign up' : 'Sign in'}
              </Button>
            </Text>
          </Stack>
        </CardBody>
      </Card>
    </Center>
  )
}
