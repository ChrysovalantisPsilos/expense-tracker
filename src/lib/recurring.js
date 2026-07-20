import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import { useAuth } from '../auth/AuthProvider.jsx'

export const FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly']

// Average months-per-period, used to normalise every rule to a monthly cost.
const MONTHLY_FACTOR = { daily: 365 / 12, weekly: 52 / 12, monthly: 1, yearly: 1 / 12 }

// A rule's cost expressed in monthly minor units (for the "per month" total).
export function monthlyMinor(rule) {
  const perPeriod = rule.amount_minor / (rule.interval_n || 1)
  return Math.round(perPeriod * MONTHLY_FACTOR[rule.frequency])
}

// "every month", "every 2 weeks", "every day"…
export function frequencyLabel({ frequency, interval_n = 1 }) {
  const unit = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[frequency]
  return interval_n > 1 ? `every ${interval_n} ${unit}s` : `every ${unit}`
}

// Advance a date by one recurrence step (mirrors the SQL materializer).
function stepDate(d, freq, n) {
  const x = new Date(d)
  if (freq === 'daily') x.setDate(x.getDate() + n)
  else if (freq === 'weekly') x.setDate(x.getDate() + n * 7)
  else if (freq === 'yearly') x.setFullYear(x.getFullYear() + n)
  else x.setMonth(x.getMonth() + n) // monthly (default)
  return x
}

// Sum of recurring charges expected to fall within [fromISO, toISO], split by
// kind (minor units, in each rule's own currency). Used to fold not-yet-charged
// subscriptions into the dashboard's projected spend. Occurrences are stepped
// from each rule's next_run, so a charge that has already materialised (its
// next_run has advanced past the window) is naturally excluded — no double
// counting. Amounts are treated as base currency (rules carry no FX rate).
export function expectedInWindow(rules, fromISO, toISO) {
  if (!fromISO || !toISO) return { expense: 0, income: 0 }
  const from = new Date(fromISO)
  const to = new Date(toISO)
  let expense = 0
  let income = 0
  for (const r of rules) {
    if (!r.is_active) continue
    const end = r.end_date ? new Date(r.end_date) : null
    let d = new Date(r.next_run)
    let guard = 0
    while (d <= to && (!end || d <= end) && guard < 500) {
      if (d >= from) {
        if (r.kind === 'income') income += r.amount_minor
        else expense += r.amount_minor
      }
      d = stepDate(d, r.frequency, r.interval_n || 1)
      guard += 1
    }
  }
  return { expense, income }
}

// The user's recurring rules (newest next-charge first), live.
export function useRecurring() {
  const { user } = useAuth()
  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data } = await supabase
      .from('recurring_rules')
      .select('*, categories(name, icon)')
      .order('is_active', { ascending: false })
      .order('next_run', { ascending: true })
    setRules(data ?? [])
    setLoading(false)
  }, [user])

  useEffect(() => { load() }, [load])
  return { rules, loading, reload: load }
}

export async function saveRecurring(rule) {
  const { id, ...fields } = rule
  let q
  if (id) {
    q = supabase.from('recurring_rules').update(fields).eq('id', id)
  } else {
    // user_id is NOT NULL and the RLS check requires it to match the caller.
    const { data: { user } } = await supabase.auth.getUser()
    q = supabase.from('recurring_rules').insert({ ...fields, user_id: user?.id })
  }
  const { error } = await q
  if (error) throw new Error(error.message)
}

export async function setRecurringActive(id, isActive) {
  const { error } = await supabase.from('recurring_rules').update({ is_active: isActive }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteRecurring(id) {
  const { error } = await supabase.from('recurring_rules').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
