import { useEffect, useState } from 'react'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { isRecentSignIn } from '../../../supabase/functions/_shared/reauth.ts'

// Whether this session signed in recently enough for the dangerous account
// actions (_shared/reauth.ts). Re-checked every 30 seconds, so a page left
// open notices when the window closes.
export function useRecentSignIn() {
  const { session } = useAuth()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30 * 1000)
    return () => clearInterval(t)
  }, [])
  return isRecentSignIn(session?.access_token, now)
}
