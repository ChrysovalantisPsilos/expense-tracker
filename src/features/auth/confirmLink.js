// The links in the Supabase Auth emails (supabase/email-templates/) point at
// our own site, not at <project>.supabase.co: a link on another domain than
// the sender's is a classic phishing signal, and it sent them to junk.
//
//   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=<type>
//
// The page (ConfirmLink.jsx) hands the token to Supabase Auth (verifyOtp),
// which answers with a session. Pure helpers here; the generator
// (scripts/build-auth-emails.mjs) builds the links from the same constants.
import { t } from '../../shared/lib/i18n/i18n.js'

export const CONFIRM_PATH = '/auth/confirm'

// Email-link types Supabase can verify, as written in the templates. 'email'
// is Supabase's newer name for a sign-up confirmation.
const TYPES = new Set(['signup', 'email', 'magiclink', 'recovery', 'email_change'])

// A token hash is hex (Supabase) or URL-safe base64; anything else is not
// worth sending to the server.
const TOKEN_HASH = /^[A-Za-z0-9_-]{8,512}$/

// The link a template's button carries, before HTML escaping.
export function confirmLinkTemplate(type) {
  if (!TYPES.has(type)) throw new Error(`unknown email-link type: ${type}`)
  return `{{ .SiteURL }}${CONFIRM_PATH}?token_hash={{ .TokenHash }}&type=${type}`
}

// `search` (location.search) → { tokenHash, type }, or null when the link is
// incomplete or malformed (the page then shows the expired-link screen).
export function parseConfirmLink(search) {
  const params = new URLSearchParams(typeof search === 'string' ? search : '')
  const tokenHash = params.get('token_hash')
  const type = params.get('type')
  if (!tokenHash || !TOKEN_HASH.test(tokenHash) || !TYPES.has(type)) return null
  return { tokenHash, type }
}

// Where a verified link goes. A password reset: the new-password screen
// (AuthProvider flags the recovery, App shows ResetPassword). Everything else
// signs in, and the signed-in app takes over exactly as for the old links: a
// pending invite first, else the stashed return path, else Home. null = stay.
export function confirmDestination(type) {
  return type === 'recovery' ? '/reset-password' : null
}

// What the expired-link screen offers: the copy and the ways on. A reset link
// → ask for a new one. Anything else was most likely used already (log in);
// signing up again with the same address sends a fresh confirmation.
export function expiredLinkHelp(type) {
  if (type === 'recovery') {
    return {
      text: t('auth:expired.recovery'),
      actions: [{ label: t('auth:expired.requestNew'), to: '/forgot-password' }],
    }
  }
  return {
    text: t('auth:expired.other'),
    actions: [
      { label: t('common:actions.logIn'), to: '/login' },
      { label: t('auth:expired.signUpAgain'), to: '/login?signup=1' },
    ],
  }
}
