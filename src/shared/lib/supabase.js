import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL } from './environment.js'
import { isNative } from './platform.js'

// Config is injected at build time by the host (Vercel env vars) — never
// committed. Two naming schemes are accepted so one bundle works in both
// Vercel environments: PROD sets VITE_SUPABASE_URL / _ANON_KEY, DEV sets the
// _DEV-suffixed pair. Whichever is present wins.
const env = import.meta.env
const url = SUPABASE_URL
const anonKey = env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY_DEV

export const isSupabaseConfigured = Boolean(url && anonKey)

if (!isSupabaseConfigured) {
  console.error(
    '[supabase] Missing config. Set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY ' +
      '(or the _DEV pair) in the host environment.',
  )
}

// A syntactically valid placeholder keeps createClient() from THROWING at
// module load when config is missing — a throw here happens before React
// mounts, so it would blank the whole page instead of surfacing an error.
// With the placeholder the app still renders (logged-out) and the console
// error above explains the real problem.
export const supabase = createClient(
  url || 'https://unconfigured.supabase.co',
  anonKey || 'unconfigured',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      // The iOS app's Google sign-in comes back on a custom URL scheme, which
      // another app could also claim, so it carries a one-time code bound to
      // this web view (PKCE) rather than the tokens themselves. The website
      // keeps supabase-js' default (implicit).
      flowType: isNative() ? 'pkce' : 'implicit',
      // Passkeys (WebAuthn) are experimental in supabase-js and must be opted in.
      experimental: { passkey: true },
    },
  },
)

// Whether the running supabase-js build exposes the passkey API + the browser
// supports WebAuthn. Used to hide passkey UI where it can't work.
// Not in the iOS app: WebAuthn there needs the app's associated domains and a
// native passkey flow (a later phase), and its capacitor:// origin can't
// match the site's passkeys.
export const passkeysSupported =
  !isNative() &&
  typeof window !== 'undefined' &&
  !!window.PublicKeyCredential &&
  typeof supabase.auth.signInWithPasskey === 'function'
