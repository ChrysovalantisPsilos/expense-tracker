import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthProvider.jsx'
import { useLiveQuery } from './db.js'
import { fetchProfile, saveTimeZone } from './profile.js'
import { EVENTS } from './keys.js'
import { payCalendar, salaryShiftOf } from './payCalendar.js'
import { usePayDays } from './transactions.js'
import { today } from './dates.js'
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

  // The salary setting (0081; null = off). Memoised on its two columns so a
  // profile refetch keeps the same object.
  const shiftDay = uid ? profile?.salary_shift_from_day : null
  const shiftCat = uid ? profile?.salary_category_id : null
  const salaryShift = useMemo(
    () => salaryShiftOf({ salary_shift_from_day: shiftDay, salary_category_id: shiftCat }),
    [shiftDay, shiftCat])

  // Pay months (0111): the months run from payday to payday. `payCalendar`
  // is null with the setting off (calendar months, no read at all) and
  // undefined while the profile or the paydays are loading. It follows the
  // device's day: recomputed at midnight and when the app comes back.
  const todayISO = useToday()
  const days = usePayDays(salaryShift)
  const cal = useMemo(() => {
    if (!uid || !profile) return undefined
    if (!salaryShift) return null
    if (days.loading && !days.rows?.days) return undefined
    return payCalendar(salaryShift, days.rows?.days ?? [], todayISO)
  }, [uid, profile, salaryShift, days.loading, days.rows, todayISO])

  // The server's "today" for this user (budget alerts, the month summary)
  // follows the device's time zone (save_time_zone, 0111).
  const savedZone = uid ? profile?.time_zone : undefined
  useEffect(() => {
    if (!uid || savedZone === undefined) return
    const zone = deviceTimeZone()
    if (zone && zone !== savedZone) saveTimeZone(zone).catch(() => { /* retried next launch */ })
  }, [uid, savedZone])

  const value = useMemo(() => ({
    profile: uid ? profile : null,
    baseCurrency: (uid && profile?.base_currency) || 'EUR',
    // Keep yearly subscriptions out of monthly spending (0068; off by default).
    separateYearly: !!(uid && profile?.yearly_separate),
    // The shared demo login (0090): the app hides what it can't use.
    isDemo: !!uid && isDemoAccount(profile),
    salaryShift,
    payCalendar: cal,
    // The newest payday (for payCalendar.paydayHints), null without one.
    lastPayDay: (salaryShift && days.rows?.days?.at(-1)) || null,
    loading,
    error,
    reload,
  }), [uid, profile, salaryShift, cal, days.rows, loading, error, reload])

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}

export function useProfile() {
  const ctx = useContext(ProfileContext)
  if (!ctx) throw new Error('useProfile must be used within <ProfileProvider>')
  return ctx
}

// The device's IANA time zone ('Europe/Brussels'), or null when unknown.
function deviceTimeZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null } catch { return null }
}

// The local date ('YYYY-MM-DD'), kept current: at the next midnight and
// whenever the page becomes visible again (a phone woken the next day).
function useToday() {
  const [day, setDay] = useState(today)
  useEffect(() => {
    let timer
    const check = () => setDay((d) => (d === today() ? d : today()))
    const arm = () => {
      const now = new Date()
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5)
      timer = setTimeout(() => { check(); arm() }, next - now)
    }
    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    arm()
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [])
  return day
}
