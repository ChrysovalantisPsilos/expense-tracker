import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import { useAuth } from '../auth/AuthProvider.jsx'
import { useLiveRefetch } from './realtime.js'
import { EVENTS } from './keys.js'

// Loads the current user's profile (base_currency, display_name). Live: profile
// edits from another device arrive via realtime; same-tab saves refresh
// instantly via the local event. (First-login category seeding lives in the app
// bootstrap — App.jsx — so this shared hook never imports a feature.)
export function useProfile() {
  const { user } = useAuth()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const run = useCallback(async () => {
    if (!user) return
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    setProfile(data)
    setLoading(false)
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
