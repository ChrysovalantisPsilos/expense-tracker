// Pure helpers about how a user signs in. No Supabase calls — callers pass in
// the auth user / API responses they already have. Labels and messages come
// in the app's language (settings:signIn.*).
import { userMessage } from '../../shared/lib/errors.js'
import { validatePassword } from '../../shared/lib/password.js'
import { t } from '../../shared/lib/i18n/i18n.js'

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
      key: 'password', label: t('settings:signIn.methods.password'), connected: withPassword,
      detail: withPassword ? user?.email ?? '' : t('settings:signIn.noPassword'),
    },
    {
      key: 'google', label: t('settings:signIn.methods.google'), connected: !!google, identity: google,
      detail: google ? google.identity_data?.email ?? t('settings:signIn.connected') : t('settings:signIn.notConnected'),
    },
  ]
  if (Array.isArray(passkeys)) {
    const n = passkeys.length
    methods.push({
      key: 'passkeys', label: t('settings:signIn.methods.passkeys'), connected: n > 0,
      detail: n ? t('settings:signIn.passkeyCount', { count: n }) : t('settings:signIn.noneYet'),
    })
  }
  return methods
}

// Why Google can't be disconnected right now, or null when it can. Supabase
// unlinks an identity only while another one remains, so the account never
// loses its last way in (a password set on a Google account isn't an
// identity of its own, so it doesn't count).
export function googleDisconnectBlock({ user, identities }) {
  if (!identities) return t('settings:signIn.block.loading')
  if (!identities.some((i) => i.provider === 'google')) return t('settings:signIn.block.notConnected')
  if (identities.length >= 2) return null
  return hasPassword(user) ? t('settings:signIn.block.createdWithGoogle') : t('settings:signIn.block.onlyWay')
}

// Why a new password can't be set, or null when it can: the sign-up rules
// (validatePassword), then whether the two fields match. `mismatchKey` names
// the words for a mismatch (Change password and Set a password each have
// their own).
export function newPasswordError(next, confirm, mismatchKey = 'settings:password.mismatch') {
  return validatePassword(String(next ?? '')) ?? (next === confirm ? null : t(mismatchKey))
}

// What a user without a password types to confirm deleting the account
// (checked as typed, in every language).
export const DELETE_CONFIRM_WORD = 'DELETE'

// The delete-account confirmation for `user` with `value` typed: whether it
// asks for the password (an email identity; the stricter path when unsure)
// or, without one, for a recent sign-in (the server checks it too,
// _shared/reauth.ts) and the typed word; whether a fresh sign-in is needed
// first; whether Delete can be pressed; and the field's label and
// placeholder.
export function deleteAccountCheck({ user, recent, value }) {
  const password = hasPasswordIdentity(user)
  const needsReauth = !password && !recent
  const typed = String(value ?? '')
  return {
    password,
    needsReauth,
    canSubmit: password ? typed.length > 0 : !needsReauth && typed.trim().toUpperCase() === DELETE_CONFIRM_WORD,
    label: t(password ? 'settings:deleteAccount.passwordLabel' : 'settings:deleteAccount.typeLabel'),
    placeholder: password ? t('settings:deleteAccount.passwordPlaceholder') : DELETE_CONFIRM_WORD,
  }
}

// What deletion erases and what stays, in the app's language: the same
// lists as the deletion confirmation email (DELETION_SCOPE,
// _shared/accountDeletion.ts; settings:deleteAccount.scope).
const SCOPE = {
  deleted: ['account', 'records', 'notifications', 'groups'],
  stays: ['shared'],
}
export function deletionScope() {
  return Object.fromEntries(Object.entries(SCOPE)
    .map(([list, ids]) => [list, ids.map((id) => t(`settings:deleteAccount.scope.${list}.${id}`))]))
}

// A user-facing message for a failed link, from supabase-js' error or the
// error the OAuth redirect came back with (redirectError). Anything without
// words of our own gets `fallback`, never Supabase's or Google's text.
export function linkErrorMessage(error, fallback = t('settings:signIn.linkError.fallback')) {
  const code = error?.code
  if (code === 'manual_linking_disabled') return t('settings:signIn.linkError.disabled')
  if (code === 'identity_already_exists') return t('settings:signIn.linkError.taken')
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
