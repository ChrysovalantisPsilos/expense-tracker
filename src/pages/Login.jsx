import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Button, Card, CardBody, Center, FormControl, FormLabel, FormHelperText,
  Input, Stack, Text, useToast, VStack,
} from '@chakra-ui/react'
import { useAuth } from '../auth/AuthProvider.jsx'
import { isSupabaseConfigured } from '../lib/supabase.js'
import Logo from '../components/Logo.jsx'

// A few of the most common weak passwords to reject outright, client-side.
// (Supabase's leaked-password protection is the authoritative server-side
// check — see the dashboard note in the README.)
const COMMON = new Set([
  '12345', '123456', '1234567', '12345678', '123456789', '1234567890',
  'password', 'password1', 'qwerty', 'abc123', '111111', '000000', 'iloveyou',
  'admin', 'letmein', 'welcome', 'monkey', 'dragon',
])

// Returns an error string, or null if the password is acceptable.
function validatePassword(pw) {
  if (pw.length < 8) return 'Use at least 8 characters.'
  if (!/[a-zA-Z]/.test(pw)) return 'Include at least one letter.'
  if (!/[0-9]/.test(pw)) return 'Include at least one number.'
  if (COMMON.has(pw.toLowerCase())) return 'That password is too common — pick something less guessable.'
  return null
}

export default function Login() {
  const { signInWithPassword, signUp } = useAuth()
  const [searchParams] = useSearchParams()
  const [mode, setMode] = useState(searchParams.get('signup') ? 'signup' : 'signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    if (mode === 'signup') {
      const err = validatePassword(password)
      if (err) { toast({ title: err, status: 'warning' }); return }
    }
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
      navigate('/', { replace: true })
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
                  <Input type="password" value={password}
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    onChange={(e) => setPassword(e.target.value)} />
                  {mode === 'signup' && (
                    <FormHelperText>At least 8 characters, with a letter and a number.</FormHelperText>
                  )}
                </FormControl>
                <Button type="submit" isLoading={busy} w="full">
                  {mode === 'signin' ? 'Sign in' : 'Sign up'}
                </Button>
              </Stack>
            </form>

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
