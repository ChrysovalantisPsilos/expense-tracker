import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { passkeysSupported } from '../../shared/lib/supabase.js'
import { useLiveQuery } from '../../shared/lib/db.js'
import { toPasskeyList } from './authMethods.js'

// Settings → Security's reads (through AuthProvider, which wraps Supabase
// Auth). One-shot reads: identities and passkeys aren't tables we can watch,
// so callers reload after a change.

// The user's passkeys. `data` stays null when this browser can't do WebAuthn,
// and `error` is set when passkeys aren't enabled server-side (the list call
// fails) — either way the passkey UI hides.
export function usePasskeys() {
  const { listPasskeys } = useAuth()
  return useLiveQuery(async () => {
    const { data, error } = await listPasskeys()
    if (error) throw error
    return toPasskeyList(data)
  }, { enabled: passkeysSupported, initial: null })
}

// The identities (email, google) linked to the signed-in user; null while loading.
export function useIdentities() {
  const { getIdentities, user } = useAuth()
  return useLiveQuery(getIdentities, { deps: [user?.id], initial: null })
}
