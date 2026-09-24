import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Button, FormControl, FormLabel, Input, Stack, Text, Tooltip, useToast,
} from '@chakra-ui/react'
import { Fingerprint, KeyRound, LogIn } from 'lucide-react'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { validatePassword } from '../../shared/lib/password.js'
import Panel from '../../shared/ui/kit/Panel.jsx'
import ItemRow from '../../shared/ui/kit/ItemRow.jsx'
import GoogleIcon from '../../shared/ui/GoogleIcon.jsx'
import {
  signInMethods, googleDisconnectBlock, linkErrorMessage, redirectError,
} from './authMethods.js'
import { userMessage } from '../../shared/lib/errors.js'

// Set before leaving for Google's consent screen; its presence on the way
// back means "this load is the end of a link attempt" (sessionStorage: the
// same tab). Supabase may strip the URL's tokens before this page mounts, so
// the outcome is read from the identities, not the URL alone.
const LINKING = 'budge:linkingGoogle'
const ICONS = { password: KeyRound, passkeys: Fingerprint }

// Settings → Security: how this account can sign in — email & password,
// Google, passkeys — with Connect/Disconnect for Google and "Set a password"
// for a Google-only account. The last way in can't be removed
// (googleDisconnectBlock; Supabase enforces it too).
export default function SignInMethodsCard({ user, identities, passkeys }) {
  const { linkGoogle, unlinkIdentity, setFirstPassword, markPasswordSet } = useAuth()
  const toast = useToast()
  const location = useLocation()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(null)
  const [settingPassword, setSettingPassword] = useState(false)
  const ids = identities.data

  // Back from Google: say how it went, once, then tidy the URL.
  const handled = useRef(false)
  useEffect(() => {
    let pending = null
    try { pending = sessionStorage.getItem(LINKING) } catch { /* storage blocked */ }
    if (!pending || handled.current) return
    const err = redirectError(location.search, window.location.hash)
    if (!err && ids === null) return // wait for the identities
    handled.current = true
    try { sessionStorage.removeItem(LINKING) } catch { /* storage blocked */ }
    if (err) {
      console.error('[settings] Google link came back with an error:', err)
      toast({ title: 'Google wasn’t connected', description: linkErrorMessage(err), status: 'error' })
    } else if (ids.some((i) => i.provider === 'google')) {
      toast({ title: 'Google connected', description: 'You can now sign in with Google too.', status: 'success' })
    } else {
      toast({ title: 'Google wasn’t connected', status: 'warning' })
    }
    if (location.search || window.location.hash) navigate(location.pathname, { replace: true })
  }, [ids, location.pathname, location.search, navigate, toast])

  async function connect() {
    setBusy('google')
    try { sessionStorage.setItem(LINKING, '1') } catch { /* storage blocked */ }
    const returnTo = `${window.location.origin}${location.pathname}?linked=google`
    const { error } = await linkGoogle(returnTo)
    if (error) { // it never left for Google
      try { sessionStorage.removeItem(LINKING) } catch { /* storage blocked */ }
      setBusy(null)
      console.error('[settings] Google link failed:', error)
      toast({ title: 'Couldn’t connect Google', description: linkErrorMessage(error), status: 'error' })
    }
  }

  async function disconnect(identity) {
    setBusy('google')
    const { error } = await unlinkIdentity(identity)
    setBusy(null)
    if (error) {
      console.error('[settings] Google unlink failed:', error)
      toast({
        title: 'Couldn’t disconnect Google',
        description: linkErrorMessage(error, 'Google is still connected. Please try again.'),
        status: 'error',
      })
      return
    }
    toast({ title: 'Google disconnected', status: 'success' })
    identities.reload()
  }

  const methods = signInMethods({ user, identities: ids, passkeys })
  const block = googleDisconnectBlock({ user, identities: ids })

  function action(m) {
    if (m.key === 'google') {
      if (!m.connected) {
        return <Button size="sm" onClick={connect} isLoading={busy === 'google'}>Connect</Button>
      }
      const button = (
        <Button size="sm" variant="outline" isDisabled={!!block} isLoading={busy === 'google'}
          onClick={() => disconnect(m.identity)}>Disconnect</Button>
      )
      return block ? <Tooltip label={block}><span>{button}</span></Tooltip> : button
    }
    if (m.key === 'password' && !m.connected && !settingPassword) {
      return <Button size="sm" onClick={() => setSettingPassword(true)}>Set a password</Button>
    }
    return null
  }

  return (
    <Panel title="Sign-in methods" icon={LogIn}
      subtitle="Ways you can sign in to this account. At least one always stays.">
      <Stack spacing={1}>
        {methods.map((m) => (
          <ItemRow key={m.key} media={m.key === 'google' ? <GoogleTile /> : undefined}
            icon={ICONS[m.key]} title={m.label} meta={m.detail} trailing={action(m)} />
        ))}
      </Stack>
      {block && ids && methods.find((m) => m.key === 'google')?.connected && (
        <Text fontSize="xs" color="text.muted" mt={2}>{block}</Text>
      )}
      {settingPassword && (
        <SetPasswordForm email={user?.email} onCancel={() => setSettingPassword(false)}
          onDone={() => setSettingPassword(false)}
          setFirstPassword={setFirstPassword} markPasswordSet={markPasswordSet} />
      )}
    </Panel>
  )
}

function GoogleTile() {
  return (
    <Stack boxSize="32px" borderRadius="lg" bg="bg.subtle" align="center" justify="center" flexShrink={0}>
      <GoogleIcon boxSize="16px" />
    </Stack>
  )
}

// A first password for a Google-only account (same rules as sign-up).
function SetPasswordForm({ email, onCancel, onDone, setFirstPassword, markPasswordSet }) {
  const toast = useToast()
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    const err = validatePassword(next)
    if (err) { toast({ title: err, status: 'warning' }); return }
    if (next !== confirm) { toast({ title: 'Passwords don’t match.', status: 'warning' }); return }
    setBusy(true)
    const { error } = await setFirstPassword(next)
    setBusy(false)
    if (error?.code === 'current_password_invalid') {
      // It already had one: show the change-password card instead.
      await markPasswordSet()
      toast({
        title: 'This account already has a password',
        description: 'Change it under Password below, or use “Forgot password?” on the sign-in page.',
        status: 'info',
      })
      onDone()
      return
    }
    if (error) {
      console.error('[settings] first password failed:', error)
      toast({ title: 'Couldn’t set the password', description: userMessage(error), status: 'error' })
      return
    }
    toast({ title: 'Password set', description: `You can now also sign in with ${email} and this password.`, status: 'success' })
    onDone()
  }

  return (
    <Stack as="form" onSubmit={submit} spacing={3} maxW="sm" mt={4}>
      <Text fontSize="sm" color="text.muted">
        Sign in with your email ({email}) and a password as well as with Google.
      </Text>
      <FormControl isRequired>
        <FormLabel>New password</FormLabel>
        <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        <Text fontSize="xs" color="text.muted" mt={1}>At least 8 characters, with a letter and a number.</Text>
      </FormControl>
      <FormControl isRequired>
        <FormLabel>Confirm password</FormLabel>
        <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </FormControl>
      <Stack direction="row" spacing={2}>
        <Button type="submit" isLoading={busy} isDisabled={!next || !confirm}>Set password</Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </Stack>
    </Stack>
  )
}
