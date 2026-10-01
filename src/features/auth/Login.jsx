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
import { Trans, useT } from '../../shared/lib/i18n/I18nProvider.jsx'
import { signupConsentMetadata } from '../privacy/legal.js'
import { rememberConsentMarker } from '../privacy/legalConsentStore.js'
import AuthLayout from './AuthLayout.jsx'
import GoogleIcon from '../../shared/ui/GoogleIcon.jsx'
import AppleIcon from '../../shared/ui/AppleIcon.jsx'
import { userMessage } from '../../shared/lib/errors.js'
import { firstInvalid } from '../../shared/lib/formChecks.js'
import { AUTH_FIELDS, authErrors, consentError } from './authChecks.js'

export default function Login() {
  const t = useT('auth')
  const { signInWithPassword, signUp, signInWithPasskey, signInWithProvider } = useAuth()
  const [searchParams] = useSearchParams()
  const [mode, setMode] = useState(searchParams.get('signup') ? 'signup' : 'signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  // Field errors show from the first submit on, and then follow the typing.
  const [tried, setTried] = useState(false)
  // "Sign up with Google/Apple" pressed without the tick: only the tick's error shows.
  const [providerTried, setProviderTried] = useState(false)
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
      toast({ title: t('login.passkeyFailed'), description: userMessage(error), status: 'error' })
      return
    }
    navigate(landing, { replace: true })
  }

  const errors = tried ? authErrors({ mode, email, password, accepted }) : {}
  const consentMsg = errors.consent ?? (providerTried ? consentError({ mode, accepted }) : null)

  function switchMode(m) {
    setMode(m)
    setTried(false)
    setProviderTried(false)
    setServerError('')
  }

  // Signing up with Google or Apple needs the same tick as by email. Neither
  // can carry it as account metadata, so the ticked versions wait in this tab
  // until the app is back and records them (useLegalGate); logging in with
  // either ticks nothing, and a new account made that way meets the full
  // prompt instead.
  function handleProvider(provider) {
    if (mode === 'signup' && !accepted) {
      setProviderTried(true)
      fieldRefs.consent.current?.focus()
      return
    }
    rememberConsentMarker(mode === 'signup')
    rememberReturnPath(next)
    signInWithProvider(provider)
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
      setServerError(userMessage(error, t('serverError')))
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
      title={mode === 'signin' ? t('login.title') : t('signup.title')}
      subtitle={mode === 'signin' ? t('login.subtitle') : t('signup.subtitle')}>
      {/* A local-setup hint for developers only; never shown on a built site. */}
      {import.meta.env.DEV && !isSupabaseConfigured && (
        <Text fontSize="sm" color="status.warning" textAlign="center">{t('notConfigured')}</Text>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <Stack spacing={4}>
          <FormControl isRequired isInvalid={!!errors.email}>
            <FormLabel>{t('email')}</FormLabel>
            <Input ref={fieldRefs.email} type="email" name="email" autoComplete="email"
              inputMode="email" autoCapitalize="none" spellCheck={false}
              value={email} onChange={(e) => setEmail(e.target.value)} />
            <FormErrorMessage>{errors.email}</FormErrorMessage>
          </FormControl>
          <FormControl isRequired isInvalid={!!errors.password}>
            <FormLabel>{t('password.label')}</FormLabel>
            <InputGroup>
              <Input ref={fieldRefs.password} type={showPassword ? 'text' : 'password'} name="password"
                value={password} pr="48px"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                onChange={(e) => setPassword(e.target.value)} />
              <InputRightElement>
                <IconButton size="sm" variant="ghost" aria-pressed={showPassword}
                  aria-label={showPassword ? t('password.hide') : t('password.show')}
                  icon={showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  onClick={() => setShowPassword((v) => !v)} />
              </InputRightElement>
            </InputGroup>
            {mode === 'signup' && !errors.password && (
              <FormHelperText>{t('password.hint')}</FormHelperText>
            )}
            <FormErrorMessage>{errors.password}</FormErrorMessage>
          </FormControl>
          {mode === 'signup' && (
            <FormControl isRequired isInvalid={!!consentMsg}>
              <Checkbox ref={fieldRefs.consent} isChecked={accepted} size="lg"
                onChange={(e) => setAccepted(e.target.checked)}
                alignItems="flex-start" colorScheme="brand" spacing={3}>
                <Text as="span" fontSize="sm" color="text.muted" display="block" mt="-1px">
                  <Trans t={t} k="signup.consent" components={{
                    terms: <Link as={RouterLink} to="/terms" target="_blank" variant="inline" />,
                    privacy: <Link as={RouterLink} to="/privacy" target="_blank" variant="inline" />,
                  }} />
                </Text>
              </Checkbox>
              <FormErrorMessage>{consentMsg}</FormErrorMessage>
            </FormControl>
          )}
          {mode === 'signup' && (
            <Text fontSize="xs" color="text.muted">{t('common:hobby.disclaimer')}</Text>
          )}
          {mode === 'signin' && (
            <Button variant="link" colorScheme="brand" size="sm" alignSelf="flex-end"
              onClick={() => { rememberReturnPath(next); navigate('/forgot-password') }}>
              {t('login.forgot')}
            </Button>
          )}
          {serverError && (
            <Alert status="error" borderRadius="lg" role="alert">
              <AlertIcon />
              <AlertDescription fontSize="sm">{serverError}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" isLoading={busy} w="full">
            {mode === 'signin' ? t('common:actions.logIn') : t('common:actions.signUp')}
          </Button>
        </Stack>
      </form>

      <HStack>
        <Divider />
        <Text fontSize="xs" color="text.muted" whiteSpace="nowrap">{t('orContinue')}</Text>
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
          onClick={() => handleProvider('google')}>
          {mode === 'signin' ? t('login.google') : t('signup.google')}
        </Button>
        {/* Apple's guidelines: black with white words and logo (white with
            black in the dark theme), "Sign in/up with Apple". */}
        <Button w="full" fontWeight="500"
          bg="black" color="white" _hover={{ bg: 'gray.800' }} _active={{ bg: 'gray.700' }}
          _dark={{ bg: 'white', color: 'black', _hover: { bg: 'gray.100' }, _active: { bg: 'gray.200' } }}
          leftIcon={<AppleIcon boxSize={5} />}
          onClick={() => handleProvider('apple')}>
          {mode === 'signin' ? t('login.apple') : t('signup.apple')}
        </Button>
        {mode === 'signin' && passkeysSupported && (
          <Button variant="outline" colorScheme="gray" w="full"
            leftIcon={<KeyRound size={18} />} isLoading={passkeyBusy}
            onClick={handlePasskey}>
            {t('login.passkey')}
          </Button>
        )}
      </Stack>

      <Text fontSize="sm" textAlign="center" color="text.muted">
        <Trans t={t} k={mode === 'signin' ? 'login.switch' : 'signup.switch'} components={{
          action: <Button variant="link" colorScheme="brand" size="sm"
            onClick={() => switchMode(mode === 'signin' ? 'signup' : 'signin')} />,
        }} />
      </Text>
    </AuthLayout>
  )
}
