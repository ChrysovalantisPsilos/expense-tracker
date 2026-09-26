import { createContext, useContext, useEffect, useMemo } from 'react'
import { useAuth } from '../auth/AuthProvider.jsx'
import { useLiveQuery } from './db.js'
import { fetchProfile } from './profile.js'
import { EVENTS } from './keys.js'
import { salaryShiftOf } from './salaryShift.js'
import { isDemoAccount } from './demoAccount.js'

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

  // Salary paid late in the month counts toward the next (0081; null = off).
  // Memoised on its two columns so a profile refetch keeps the same object.
  const shiftDay = uid ? profile?.salary_shift_from_day : null
  const shiftCat = uid ? profile?.salary_category_id : null
  const salaryShift = useMemo(
    () => salaryShiftOf({ salary_shift_from_day: shiftDay, salary_category_id: shiftCat }),
    [shiftDay, shiftCat])

  const value = useMemo(() => ({
    profile: uid ? profile : null,
    baseCurrency: (uid && profile?.base_currency) || 'EUR',
    // Keep yearly subscriptions out of monthly spending (0068; off by default).
    separateYearly: !!(uid && profile?.yearly_separate),
    // The shared demo login (0090): the app hides what it can't use.
    isDemo: !!uid && isDemoAccount(profile),
    salaryShift,
    loading,
    error,
    reload,
  }), [uid, profile, salaryShift, loading, error, reload])

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}

export function useProfile() {
  const ctx = useContext(ProfileContext)
  if (!ctx) throw new Error('useProfile must be used within <ProfileProvider>')
  return ctx
}
