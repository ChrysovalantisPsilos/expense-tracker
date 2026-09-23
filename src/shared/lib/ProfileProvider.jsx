import { createContext, useContext, useEffect, useMemo } from 'react'
import { useAuth } from '../auth/AuthProvider.jsx'
import { useLiveQuery } from './db.js'
import { fetchProfile } from './profile.js'
import { EVENTS } from './keys.js'

const ProfileContext = createContext(null)

// The signed-in user's profile (base_currency, display_name, …), fetched ONCE
// and kept live over ONE realtime channel for the whole app — every
// useProfile() is a context read. Profile edits from another device arrive via
// realtime; same-tab saves refresh instantly via the local profileUpdated event.
// Keyed on user.id, so a token refresh (a new session object) doesn't refetch.
export function ProfileProvider({ children }) {
  const { user } = useAuth()
  const uid = user?.id ?? null
  const { data: profile, loading, error, reload } = useLiveQuery(() => fetchProfile(uid), {
    key: uid ? 'profile' : null,
    specs: [{ table: 'profiles', filter: uid ? `id=eq.${uid}` : undefined }],
    deps: [uid],
    enabled: !!uid,
    initial: null,
    keepPrevious: false, // never show one account's profile to the next
  })

  useEffect(() => {
    if (!uid) return undefined
    window.addEventListener(EVENTS.profileUpdated, reload)
    return () => window.removeEventListener(EVENTS.profileUpdated, reload)
  }, [uid, reload])

  const value = useMemo(() => ({
    profile: uid ? profile : null,
    baseCurrency: (uid && profile?.base_currency) || 'EUR',
    loading,
    error,
    reload,
  }), [uid, profile, loading, error, reload])

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}

export function useProfile() {
  const ctx = useContext(ProfileContext)
  if (!ctx) throw new Error('useProfile must be used within <ProfileProvider>')
  return ctx
}
