import { useState } from 'react'
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Button, Checkbox, Divider, FormControl, FormLabel, FormHelperText,
  Input, Link, Stack, Text, useToast, HStack,
} from '@chakra-ui/react'
import { KeyRound } from 'lucide-react'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { isSupabaseConfigured, passkeysSupported } from '../../shared/lib/supabase.js'
import { validatePassword } from '../../shared/lib/password.js'
import { STORAGE_KEYS } from '../../shared/lib/keys.js'
import { NEXT_PARAM, rememberReturnPath, safeReturnPath } from '../../shared/lib/returnPath.js'
import { DISCLAIMER } from '../../shared/lib/disclaimer.js'
import { signupConsentMetadata } from '../privacy/legal.js'
import AuthLayout from './AuthLayout.jsx'
import GoogleIcon from '../../shared/ui/GoogleIcon.jsx'
import { userMessage } from '../../shared/lib/errors.js'

export default function Login() {
  const { signInWithPassword, signUp, signInWithPasskey, signInWithProvider } = useAuth()
  const [searchParams] = useSearchParams()
  const [mode, setMode] = useState(searchParams.get('signup') ? 'signup' : 'signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [passkeyBusy, setPasskeyBusy] = useState(false)
  const toast = useToast()
  const navigate = useNavigate()
  // Where to go once signed in (a signed-out visit to an app page sent the
  // visitor here). Untrusted input: safeReturnPath drops anything that isn't
  // an app-relative path. Password and passkey sign-ins happen on this page,
  // so they go there directly; Google, the confirmation email and a password
  // reset come back to the site root, so for those it's stashed and the
  // signed-in app picks it up (App.jsx). Every attempt overwrites the stash,
  // so an abandoned one can't steer a later sign-in.
  const next = safeReturnPath(searchParams.get(NEXT_PARAM))
  const landing = next ?? '/'

  async function handlePasskey() {
    rememberReturnPath(null)
    setPasskeyBusy(true)
    const { error } = await signInWithPasskey()
    setPasskeyBusy(false)
    if (error) {
      console.error('[auth] passkey sign-in failed:', error)
      toast({ title: 'Passkey sign-in failed', description: userMessage(error), status: 'error' })
      return
    }
    navigate(landing, { replace: true })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (mode === 'signup') {
      const err = validatePassword(password)
      if (err) { toast({ title: err, status: 'warning' }); return }
      if (!accepted) {
        toast({ title: 'Please accept the Terms of Use and Privacy Notice', status: 'warning' })
        return
      }
    }
    // Sign-up may continue from the confirmation email; sign-in stays here.
    rememberReturnPath(mode === 'signup' ? next : null)
    setBusy(true)
    const { data, error } = mode === 'signin'
      ? await signInWithPassword(email, password)
      : await signUp(email, password, signupConsentMetadata())
    setBusy(false)
    if (error) {
      // Known cases (wrong password, unconfirmed email, rate limit…) get our
      // own words; anything else, including a bodiless 500 when the
      // confirmation email can't be sent, a generic line.
      console.error('[auth] sign-in/up failed:', error)
      toast({ title: userMessage(error, 'Something went wrong on our side — please try again in a moment.'), status: 'error' })
      return
    }
    // Sign-up with email confirmation ON returns no session (go check your
    // inbox); with confirmation OFF it returns a session (you're already in).
    if (mode === 'signup' && !data?.session) {
      sessionStorage.setItem(STORAGE_KEYS.pendingEmail, email)
      navigate('/verify-email', { replace: true })
    } else {
      navigate(landing, { replace: true })
    }
  }

  return (
    <AuthLayout
      title={mode === 'signin' ? 'Welcome back' : 'Create your account'}
      subtitle={mode === 'signin'
        ? 'Sign in to your groups and budgets'
        : 'Free — track your money and split with friends'}>
      {!isSupabaseConfigured && (
        <Text fontSize="sm" color="status.warning" textAlign="center">
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
          {mode === 'signup' && (
            <Checkbox isChecked={accepted} onChange={(e) => setAccepted(e.target.checked)}
              alignItems="flex-start" colorScheme="brand" isRequired>
              <Text as="span" fontSize="sm" color="text.muted">
                I’m 16 or older and I accept the{' '}
                <Link as={RouterLink} to="/terms" target="_blank" color="accent.fg">Terms of Use</Link>{' '}
                and the{' '}
                <Link as={RouterLink} to="/privacy" target="_blank" color="accent.fg">Privacy Notice</Link>.
              </Text>
            </Checkbox>
          )}
          {mode === 'signup' && (
            <Text fontSize="xs" color="text.muted">{DISCLAIMER}</Text>
          )}
          {mode === 'signin' && (
            <Button variant="link" colorScheme="brand" size="sm" alignSelf="flex-end"
              onClick={() => { rememberReturnPath(next); navigate('/forgot-password') }}>
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
          onClick={() => { rememberReturnPath(next); signInWithProvider('google') }}>
          {mode === 'signin' ? 'Sign in with Google' : 'Sign up with Google'}
        </Button>
        {mode === 'signup' && (
          <Text fontSize="xs" color="text.muted" textAlign="center">
            With Google, you’ll be asked to accept the Terms and Privacy Notice after signing in.
          </Text>
        )}
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
    </AuthLayout>
  )
}
