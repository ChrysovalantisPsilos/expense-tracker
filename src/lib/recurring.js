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
