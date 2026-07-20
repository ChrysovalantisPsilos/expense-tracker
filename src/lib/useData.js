import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import { useAuth } from '../auth/AuthProvider.jsx'
import { isoDate } from './dates.js'

// Categories for the current user (optionally filtered by kind).
export function useCategories(kind) {
  const { user } = useAuth()
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    let q = supabase.from('categories').select('*').eq('is_archived', false).order('name')
    if (kind) q = q.eq('kind', kind)
    const { data } = await q
    setCategories(data ?? [])
    setLoading(false)
  }, [user, kind])

  useEffect(() => { load() }, [load])
  return { categories, loading, reload: load }
}

// Transactions in a date range (defaults to current month). Optional
// `categoryId` and `limit` narrow the query server-side (used by search).
// `withGroup` also embeds the owning group's name for mirrored group expenses,
// so the dashboard can bucket them under the group instead of Uncategorized.
export function useTransactions({ kind, from, to, categoryId, limit, withGroup } = {}) {
  const { user } = useAuth()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const select = withGroup
      ? '*, categories(name, icon), group_expenses(groups(name))'
      : '*, categories(name, icon)'
    let q = supabase
      .from('transactions')
      .select(select)
      .order('spent_at', { ascending: false })
    if (kind) q = q.eq('kind', kind)
    if (from) q = q.gte('spent_at', from)
    if (to) q = q.lte('spent_at', to)
    if (categoryId) q = q.eq('category_id', categoryId)
    if (limit) q = q.limit(limit)
    const { data } = await q
    setRows(data ?? [])
    setLoading(false)
  }, [user, kind, from, to, categoryId, limit, withGroup])

  useEffect(() => { load() }, [load])
  // `mutate` lets callers optimistically update the list (edit/delete) so it
  // reflects immediately, even offline where a reload would show stale cache.
  return { rows, loading, reload: load, mutate: setRows }
}

// Re-exported for existing callers; the implementation lives in lib/dates.js.
export { monthRange } from './dates.js'

// Dashboard period options, clamped so the user never sees months/years from
// before they have any data. The range spans from `oldestISO` (their oldest
// transaction, YYYY-MM-DD) up to now — importing older data extends it for
// free. With no transactions, only "This month" is offered.
export function buildPeriods(oldestISO, d = new Date()) {
  const iso = isoDate
  const y = d.getFullYear()
  const m = d.getMonth()

  const thisMonth = {
    value: `m:${y}-${m + 1}`, label: 'This month',
    from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)),
  }
  if (!oldestISO) return [thisMonth]

  const oldest = new Date(oldestISO)
  const oldestY = oldest.getFullYear()
  const oldestMonthIdx = oldestY * 12 + oldest.getMonth()
  const nowMonthIdx = y * 12 + m

  const out = []
  for (let idx = nowMonthIdx; idx >= oldestMonthIdx; idx--) {
    const start = new Date(Math.floor(idx / 12), idx % 12, 1)
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0)
    out.push({
      value: `m:${start.getFullYear()}-${start.getMonth() + 1}`,
      label: idx === nowMonthIdx ? 'This month' : start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      from: iso(start), to: iso(end),
    })
  }
  for (let yr = y; yr >= oldestY; yr--) {
    out.push({ value: `y:${yr}`, label: yr === y ? 'This year' : String(yr), from: `${yr}-01-01`, to: `${yr}-12-31` })
  }
  // "All time" only adds value once there's data spanning more than this month.
  if (oldestMonthIdx < nowMonthIdx) out.push({ value: 'all', label: 'All time', from: null, to: null })
  return out
}

// The user's oldest transaction date (YYYY-MM-DD), or null if none.
export async function oldestTransactionDate() {
  const { data } = await supabase
    .from('transactions')
    .select('spent_at')
    .order('spent_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return data?.spent_at ?? null
}

// One-time default-category seed after first login.
export async function ensureSeeded() {
  const { count } = await supabase
    .from('categories')
    .select('id', { count: 'exact', head: true })
  if ((count ?? 0) === 0) {
    await supabase.rpc('seed_default_categories')
  }
}
