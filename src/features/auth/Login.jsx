import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Button, Card, CardBody, Center, Divider, FormControl, FormLabel, FormHelperText,
  Input, Stack, Text, useToast, VStack, HStack, Icon,
} from '@chakra-ui/react'
import { KeyRound } from 'lucide-react'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { isSupabaseConfigured, passkeysSupported } from '../../shared/lib/supabase.js'
import { validatePassword } from '../../shared/lib/password.js'
import { STORAGE_KEYS } from '../../shared/lib/keys.js'
import Logo from '../../shared/ui/Logo.jsx'

export default function Login() {
  const { signInWithPassword, signUp, signInWithPasskey, signInWithProvider } = useAuth()
  const [searchParams] = useSearchParams()
  const [mode, setMode] = useState(searchParams.get('signup') ? 'signup' : 'signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [passkeyBusy, setPasskeyBusy] = useState(false)
  const toast = useToast()
  const navigate = useNavigate()

  async function handlePasskey() {
    setPasskeyBusy(true)
    const { error } = await signInWithPasskey()
    setPasskeyBusy(false)
    if (error) {
      toast({ title: 'Passkey sign-in failed', description: error.message, status: 'error' })
      return
    }
    navigate('/', { replace: true })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (mode === 'signup') {
      const err = validatePassword(password)
      if (err) { toast({ title: err, status: 'warning' }); return }
    }
    setBusy(true)
    const fn = mode === 'signin' ? signInWithPassword : signUp
    const { data, error } = await fn(email, password)
    setBusy(false)
    if (error) {
      // Some backend failures (e.g. a 500 when the confirmation email can't be
      // sent) come back with no readable body, which would otherwise render as
      // an empty "{}". Fall back to a human message so the user isn't stranded.
      const raw = (error.message || '').trim()
      const msg = raw && raw !== '{}'
        ? raw
        : 'Something went wrong on our side — please try again in a moment.'
      toast({ title: msg, status: 'error' })
      return
    }
    // Sign-up with email confirmation ON returns no session (go check your
    // inbox); with confirmation OFF it returns a session (you're already in).
    if (mode === 'signup' && !data?.session) {
      sessionStorage.setItem(STORAGE_KEYS.pendingEmail, email)
      navigate('/verify-email', { replace: true })
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
                {mode === 'signin' && (
                  <Button variant="link" colorScheme="brand" size="sm" alignSelf="flex-end"
                    onClick={() => navigate('/forgot-password')}>
                    Forgot password?
                  </Button>
                )}
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
              {/* Google's guidelines: white button, the four-color G, and
                  "Sign in/up with Google". Kept white in both themes (the mark
                  is designed for a light surface). */}
              <Button w="full" bg="white" color="gray.700" fontWeight="500"
                borderWidth="1px" borderColor="gray.300"
                _hover={{ bg: 'gray.50' }} _active={{ bg: 'gray.100' }}
                leftIcon={<GoogleIcon boxSize={5} />}
                onClick={() => signInWithProvider('google')}>
                {mode === 'signin' ? 'Sign in with Google' : 'Sign up with Google'}
              </Button>
              {mode === 'signin' && passkeysSupported && (
                <Button variant="outline" colorScheme="gray" w="full"
                  leftIcon={<KeyRound size={18} />} isLoading={passkeyBusy}
                  onClick={handlePasskey}>
                  Sign in with a passkey
                </Button>
              )}
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

// The official four-color Google "G". Each path carries its own brand color, so
// it renders in full color regardless of the button's text color — and per
// Google's guidelines the mark must not be recolored.
function GoogleIcon(props) {
  return (
    <Icon viewBox="0 0 48 48" {...props}>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Icon>
  )
}
