import { createClient } from '@supabase/supabase-js'

// Config is injected at build time by the host (Vercel env vars) — never
// committed. Two naming schemes are accepted so one bundle works in both
// Vercel environments: PROD sets VITE_SUPABASE_URL / _ANON_KEY, DEV sets the
// _DEV-suffixed pair. Whichever is present wins.
const env = import.meta.env
const url = env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL_DEV
const anonKey = env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY_DEV

export const isSupabaseConfigured = Boolean(url && anonKey)

if (!isSupabaseConfigured) {
  // eslint-disable-next-line no-console
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
      // Passkeys (WebAuthn) are experimental in supabase-js and must be opted in.
      experimental: { passkey: true },
    },
  },
)

// Whether the running supabase-js build exposes the passkey API + the browser
// supports WebAuthn. Used to hide passkey UI where it can't work.
export const passkeysSupported =
  typeof window !== 'undefined' &&
  !!window.PublicKeyCredential &&
  typeof supabase.auth.signInWithPasskey === 'function'

// Edge Functions return their error detail as JSON in error.context; unwrap it
// to a readable message (falling back to error.message).
export async function edgeFunctionError(error) {
  let msg = error?.message || 'Something went wrong'
  try { const j = await error?.context?.json?.(); if (j?.error) msg = j.error } catch { /* ignore */ }
  return msg
}
