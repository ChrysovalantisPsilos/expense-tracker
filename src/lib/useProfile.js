import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import { useAuth } from '../auth/AuthProvider.jsx'
import { ensureSeeded } from './useData.js'
import { EVENTS } from './keys.js'

// Loads the current user's profile (base_currency, display_name) and seeds
// default categories on first login.
export function useProfile() {
  const { user } = useAuth()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    async function run() {
      if (!user) return
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (!active) return
      setProfile(data)
      setLoading(false)
      ensureSeeded().catch(() => {})
    }
    run()
    // Refetch when the profile is saved elsewhere (e.g. the Profile page), so
    // the nav name/avatar update immediately without a reload.
    const onUpdated = () => run()
    window.addEventListener(EVENTS.profileUpdated, onUpdated)
    return () => { active = false; window.removeEventListener(EVENTS.profileUpdated, onUpdated) }
  }, [user])

  return { profile, baseCurrency: profile?.base_currency ?? 'EUR', loading }
}
