import { useRef, useState } from 'react'
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Alert, AlertIcon, AlertDescription, Button, Checkbox, Divider, FormControl, FormErrorMessage,
  FormLabel, FormHelperText, IconButton, Input, InputGroup, InputRightElement, Link, Stack, Text,
  useToast, HStack,
} from '@chakra-ui/react'
import { Eye, EyeOff, KeyRound } from 'lucide-react'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { isSupabaseConfigured, passkeysSupported } from '../../shared/lib/supabase.js'
import { STORAGE_KEYS } from '../../shared/lib/keys.js'
import { NEXT_PARAM, rememberReturnPath, safeReturnPath } from '../../shared/lib/returnPath.js'
import { DISCLAIMER } from '../../shared/lib/disclaimer.js'
import { signupConsentMetadata } from '../privacy/legal.js'
import { rememberConsentMarker } from '../privacy/legalConsentStore.js'
import AuthLayout from './AuthLayout.jsx'
import GoogleIcon from '../../shared/ui/GoogleIcon.jsx'
import { userMessage } from '../../shared/lib/errors.js'
import { firstInvalid } from '../../shared/lib/formChecks.js'
import { AUTH_FIELDS, authErrors, consentError } from './authChecks.js'

export default function Login() {
  const { signInWithPassword, signUp, signInWithPasskey, signInWithProvider } = useAuth()
  const [searchParams] = useSearchParams()
  const [mode, setMode] = useState(searchParams.get('signup') ? 'signup' : 'signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  // Field errors show from the first submit on, and then follow the typing.
  const [tried, setTried] = useState(false)
  // "Sign up with Google" pressed without the tick: only the tick's error shows.
  const [googleTried, setGoogleTried] = useState(false)
  // A failed sign-in/up (wrong password, rate limit…), shown above the button.
  const [serverError, setServerError] = useState('')
  const fieldRefs = { email: useRef(null), password: useRef(null), consent: useRef(null) }
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

  const errors = tried ? authErrors({ mode, email, password, accepted }) : {}
  const consentMsg = errors.consent ?? (googleTried ? consentError({ mode, accepted }) : null)

  function switchMode(m) {
    setMode(m)
    setTried(false)
    setGoogleTried(false)
    setServerError('')
  }

  // Signing up with Google needs the same tick as by email. Google can't carry
  // it as account metadata, so the ticked versions wait in this tab until the
  // app is back and records them (useLegalGate); logging in with Google ticks
  // nothing, and a new account made that way meets the full prompt instead.
  function handleGoogle() {
    if (mode === 'signup' && !accepted) {
      setGoogleTried(true)
      fieldRefs.consent.current?.focus()
      return
    }
    rememberConsentMarker(mode === 'signup')
    rememberReturnPath(next)
    signInWithProvider('google')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setServerError('')
    const found = authErrors({ mode, email, password, accepted })
    const first = firstInvalid(found, AUTH_FIELDS)
    if (first) {
      setTried(true)
      fieldRefs[first].current?.focus()
      return
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
      setServerError(userMessage(error, 'Something went wrong on our side — please try again in a moment.'))
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
        ? 'Log in to your groups and budgets'
        : 'Free — track your money and split with friends'}>
      {/* A local-setup hint for developers only; never shown on a built site. */}
      {import.meta.env.DEV && !isSupabaseConfigured && (
        <Text fontSize="sm" color="status.warning" textAlign="center">
          Supabase isn’t configured yet — set VITE_SUPABASE_URL and
          VITE_SUPABASE_ANON_KEY in .env.
        </Text>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <Stack spacing={4}>
          <FormControl isRequired isInvalid={!!errors.email}>
            <FormLabel>Email</FormLabel>
            <Input ref={fieldRefs.email} type="email" name="email" autoComplete="email"
              inputMode="email" autoCapitalize="none" spellCheck={false}
              value={email} onChange={(e) => setEmail(e.target.value)} />
            <FormErrorMessage>{errors.email}</FormErrorMessage>
          </FormControl>
          <FormControl isRequired isInvalid={!!errors.password}>
            <FormLabel>Password</FormLabel>
            <InputGroup>
              <Input ref={fieldRefs.password} type={showPassword ? 'text' : 'password'} name="password"
                value={password} pr="48px"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                onChange={(e) => setPassword(e.target.value)} />
              <InputRightElement>
                <IconButton size="sm" variant="ghost" aria-pressed={showPassword}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  icon={showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  onClick={() => setShowPassword((v) => !v)} />
              </InputRightElement>
            </InputGroup>
            {mode === 'signup' && !errors.password && (
              <FormHelperText>At least 8 characters, with a letter and a number.</FormHelperText>
            )}
            <FormErrorMessage>{errors.password}</FormErrorMessage>
          </FormControl>
          {mode === 'signup' && (
            <FormControl isRequired isInvalid={!!consentMsg}>
              <Checkbox ref={fieldRefs.consent} isChecked={accepted} size="lg"
                onChange={(e) => setAccepted(e.target.checked)}
                alignItems="flex-start" colorScheme="brand" spacing={3}>
                <Text as="span" fontSize="sm" color="text.muted" display="block" mt="-1px">
                  I’m 16 or older and I accept the{' '}
                  <Link as={RouterLink} to="/terms" target="_blank" variant="inline">Terms of Use</Link>{' '}
                  and the{' '}
                  <Link as={RouterLink} to="/privacy" target="_blank" variant="inline">Privacy Notice</Link>.
                </Text>
              </Checkbox>
              <FormErrorMessage>{consentMsg}</FormErrorMessage>
            </FormControl>
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
          {serverError && (
            <Alert status="error" borderRadius="lg" role="alert">
              <AlertIcon />
              <AlertDescription fontSize="sm">{serverError}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" isLoading={busy} w="full">
            {mode === 'signin' ? 'Log in' : 'Sign up'}
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
          onClick={handleGoogle}>
          {mode === 'signin' ? 'Sign in with Google' : 'Sign up with Google'}
        </Button>
        {mode === 'signin' && passkeysSupported && (
          <Button variant="outline" colorScheme="gray" w="full"
            leftIcon={<KeyRound size={18} />} isLoading={passkeyBusy}
            onClick={handlePasskey}>
            Log in with a passkey
          </Button>
        )}
      </Stack>

      <Text fontSize="sm" textAlign="center" color="text.muted">
        {mode === 'signin' ? 'Don’t have an account? ' : 'Already have one? '}
        <Button variant="link" colorScheme="brand" size="sm"
          onClick={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}>
          {mode === 'signin' ? 'Sign up' : 'Log in'}
        </Button>
      </Text>
    </AuthLayout>
  )
}
