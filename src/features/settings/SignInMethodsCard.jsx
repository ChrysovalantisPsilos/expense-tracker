import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Button, FormControl, FormLabel, Input, Stack, Text, Tooltip, useToast,
} from '@chakra-ui/react'
import { Fingerprint, KeyRound, LogIn } from 'lucide-react'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import Panel from '../../shared/ui/kit/Panel.jsx'
import ItemRow from '../../shared/ui/kit/ItemRow.jsx'
import GoogleIcon from '../../shared/ui/GoogleIcon.jsx'
import {
  signInMethods, googleDisconnectBlock, linkErrorMessage, newPasswordError, redirectError,
} from './authMethods.js'
import { userMessage } from '../../shared/lib/errors.js'
import { STORAGE_KEYS } from '../../shared/lib/keys.js'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

// Set before leaving for Google's consent screen; its presence on the way
// back means "this load is the end of a link attempt" (sessionStorage: the
// same tab). Supabase may strip the URL's tokens before this page mounts, so
// the outcome is read from the identities, not the URL alone.
const LINKING = STORAGE_KEYS.linkingGoogle
const ICONS = { password: KeyRound, passkeys: Fingerprint }

// Settings → Security: how this account can sign in — email & password,
// Google, passkeys — with Connect/Disconnect for Google and "Set a password"
// for a Google-only account. The last way in can't be removed
// (googleDisconnectBlock; Supabase enforces it too).
export default function SignInMethodsCard({ user, identities, passkeys }) {
  const t = useT('settings')
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
      toast({ title: t('signIn.google.notLinked'), description: linkErrorMessage(err), status: 'error' })
    } else if (ids.some((i) => i.provider === 'google')) {
      toast({ title: t('signIn.google.linked'), description: t('signIn.google.linkedBody'), status: 'success' })
    } else {
      toast({ title: t('signIn.google.notLinked'), status: 'warning' })
    }
    if (location.search || window.location.hash) navigate(location.pathname, { replace: true })
  }, [ids, location.pathname, location.search, navigate, toast, t])

  async function connect() {
    setBusy('google')
    try { sessionStorage.setItem(LINKING, '1') } catch { /* storage blocked */ }
    const returnTo = `${window.location.origin}${location.pathname}?linked=google`
    const { error } = await linkGoogle(returnTo)
    if (error) { // it never left for Google
      try { sessionStorage.removeItem(LINKING) } catch { /* storage blocked */ }
      setBusy(null)
      console.error('[settings] Google link failed:', error)
      toast({ title: t('signIn.google.connectFailed'), description: linkErrorMessage(error), status: 'error' })
    }
  }

  async function disconnect(identity) {
    setBusy('google')
    const { error } = await unlinkIdentity(identity)
    setBusy(null)
    if (error) {
      console.error('[settings] Google unlink failed:', error)
      toast({
        title: t('signIn.google.disconnectFailed'),
        description: linkErrorMessage(error, t('signIn.google.stillConnected')),
        status: 'error',
      })
      return
    }
    toast({ title: t('signIn.google.disconnected'), status: 'success' })
    identities.reload()
  }

  const methods = signInMethods({ user, identities: ids, passkeys })
  const block = googleDisconnectBlock({ user, identities: ids })

  function action(m) {
    if (m.key === 'google') {
      if (!m.connected) {
        return <Button size="sm" onClick={connect} isLoading={busy === 'google'}>{t('signIn.connect')}</Button>
      }
      const button = (
        <Button size="sm" variant="outline" isDisabled={!!block} isLoading={busy === 'google'}
          onClick={() => disconnect(m.identity)}>{t('signIn.disconnect')}</Button>
      )
      return block ? <Tooltip label={block}><span>{button}</span></Tooltip> : button
    }
    if (m.key === 'password' && !m.connected && !settingPassword) {
      return <Button size="sm" onClick={() => setSettingPassword(true)}>{t('signIn.setPassword')}</Button>
    }
    return null
  }

  return (
    <Panel title={t('signIn.title')} icon={LogIn} subtitle={t('signIn.subtitle')}>
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
  const t = useT('settings')
  const toast = useToast()
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    const err = newPasswordError(next, confirm, 'auth:password.mismatch')
    if (err) { toast({ title: err, status: 'warning' }); return }
    setBusy(true)
    const { error } = await setFirstPassword(next)
    setBusy(false)
    if (error?.code === 'current_password_invalid') {
      // It already had one: show the change-password card instead.
      await markPasswordSet()
      toast({
        title: t('signIn.firstPassword.hasOne'),
        description: t('signIn.firstPassword.hasOneBody'),
        status: 'info',
      })
      onDone()
      return
    }
    if (error) {
      console.error('[settings] first password failed:', error)
      toast({ title: t('signIn.firstPassword.failed'), description: userMessage(error), status: 'error' })
      return
    }
    toast({ title: t('signIn.firstPassword.done'), description: t('signIn.firstPassword.doneBody', { email }), status: 'success' })
    onDone()
  }

  return (
    <Stack as="form" onSubmit={submit} spacing={3} maxW="sm" mt={4}>
      <Text fontSize="sm" color="text.muted">{t('signIn.firstPassword.lead', { email })}</Text>
      <FormControl isRequired>
        <FormLabel>{t('auth:password.new')}</FormLabel>
        <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        <Text fontSize="xs" color="text.muted" mt={1}>{t('auth:password.hint')}</Text>
      </FormControl>
      <FormControl isRequired>
        <FormLabel>{t('auth:password.confirm')}</FormLabel>
        <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </FormControl>
      <Stack direction="row" spacing={2}>
        <Button type="submit" isLoading={busy} isDisabled={!next || !confirm}>
          {t('signIn.firstPassword.submit')}
        </Button>
        <Button variant="ghost" onClick={onCancel}>{t('common:actions.cancel')}</Button>
      </Stack>
    </Stack>
  )
}
