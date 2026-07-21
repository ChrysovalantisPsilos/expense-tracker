import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import { useAuth } from '../auth/AuthProvider.jsx'
import { useLiveRefetch } from './realtime.js'
import { ensureSeeded } from '../../features/transactions/useData.js'
import { EVENTS } from './keys.js'

// Loads the current user's profile (base_currency, display_name) and seeds
// default categories on first login. Live: profile edits from another device
// arrive via realtime; same-tab saves refresh instantly via the local event.
export function useProfile() {
  const { user } = useAuth()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const run = useCallback(async () => {
    if (!user) return
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    setProfile(data)
    setLoading(false)
    ensureSeeded().catch(() => {})
  }, [user])

  useEffect(() => {
    run()
    window.addEventListener(EVENTS.profileUpdated, run)
    return () => window.removeEventListener(EVENTS.profileUpdated, run)
  }, [run])

  useLiveRefetch(
    user ? 'profile' : null,
    [{ table: 'profiles', filter: user ? `id=eq.${user.id}` : undefined }],
    run,
  )

  return { profile, baseCurrency: profile?.base_currency ?? 'EUR', loading }
}
