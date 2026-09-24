// Pure helpers about how a user signs in. No Supabase calls — callers pass in
// the auth user / API responses they already have.
import { userMessage } from '../../shared/lib/errors.js'

// True when the account has an email/password identity (so it has a password
// to change or re-enter). Defaults to true when the providers can't be read,
// so the stricter path — asking for the password — wins.
export function hasPasswordIdentity(user) {
  const meta = user?.app_metadata ?? {}
  const providers = meta.providers || (meta.provider ? [meta.provider] : [])
  return providers.includes('email') || providers.length === 0
}

// The passkey list API has returned both a bare array and `{ passkeys }`;
// normalize either to an array.
export function toPasskeyList(data) {
  return Array.isArray(data) ? data : (data?.passkeys ?? [])
}

// Whether the account has a password at all: an email identity, or a Google
// account that set one here (Supabase adds no email identity for that, so
// setFirstPassword marks user_metadata.password_set — a UI hint only; the
// server still demands the current password to change it).
export function hasPassword(user) {
  return hasPasswordIdentity(user) || user?.user_metadata?.password_set === true
}

const providersOf = (user) => {
  const meta = user?.app_metadata ?? {}
  return meta.providers || (meta.provider ? [meta.provider] : [])
}

// The rows of Settings → Security's "Sign-in methods": email & password,
// Google, and passkeys (only when `passkeys` is a list, i.e. this browser and
// project support them). `identities` is getUserIdentities()' list, or null
// while it loads (then the user's app_metadata providers stand in).
export function signInMethods({ user, identities, passkeys }) {
  const google = identities
    ? identities.find((i) => i.provider === 'google') ?? null
    : (providersOf(user).includes('google') ? {} : null)
  const withPassword = hasPassword(user)
  const methods = [
    {
      key: 'password', label: 'Email & password', connected: withPassword,
      detail: withPassword ? user?.email ?? '' : 'No password yet',
    },
    {
      key: 'google', label: 'Google', connected: !!google, identity: google,
      detail: google ? google.identity_data?.email ?? 'Connected' : 'Not connected',
    },
  ]
  if (Array.isArray(passkeys)) {
    const n = passkeys.length
    methods.push({
      key: 'passkeys', label: 'Passkeys', connected: n > 0,
      detail: n ? `${n} passkey${n === 1 ? '' : 's'}` : 'None yet',
    })
  }
  return methods
}

// Why Google can't be disconnected right now, or null when it can. Supabase
// unlinks an identity only while another one remains, so the account never
// loses its last way in (a password set on a Google account isn't an
// identity of its own, so it doesn't count).
export function googleDisconnectBlock({ user, identities }) {
  if (!identities) return 'Still loading your sign-in methods.'
  if (!identities.some((i) => i.provider === 'google')) return 'Google isn’t connected.'
  if (identities.length >= 2) return null
  return hasPassword(user)
    ? 'This account was created with Google, so Google stays connected. You can sign in with either.'
    : 'Google is your only way to sign in. Set a password first.'
}

// A user-facing message for a failed link, from supabase-js' error or the
// error the OAuth redirect came back with (redirectError). Anything without
// words of our own gets `fallback`, never Supabase's or Google's text.
export function linkErrorMessage(error, fallback = 'Google wasn’t connected. Please try again.') {
  const code = error?.code
  if (code === 'manual_linking_disabled') {
    return 'Connecting a Google account isn’t switched on for this site yet. Please try again later.'
  }
  if (code === 'identity_already_exists') {
    return 'That Google account already belongs to another Budgeer account.'
  }
  return userMessage(error, fallback)
}

// The error an OAuth redirect came back with (?error=… or #error=…), or null.
export function redirectError(search = '', hash = '') {
  for (const raw of [search, hash]) {
    const p = new URLSearchParams(String(raw).replace(/^[?#]/, ''))
    if (p.get('error') || p.get('error_code')) {
      return { code: p.get('error_code') || p.get('error'), description: p.get('error_description') || null }
    }
  }
  return null
}
