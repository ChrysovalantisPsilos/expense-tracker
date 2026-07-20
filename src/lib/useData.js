import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import { useAuth } from '../auth/AuthProvider.jsx'

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

// Month boundaries as YYYY-MM-DD strings (no Date.now dependency in callers).
export function monthRange(d = new Date()) {
  const start = new Date(d.getFullYear(), d.getMonth(), 1)
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  const iso = (x) => x.toISOString().slice(0, 10)
  return { from: iso(start), to: iso(end) }
}

// Dashboard period options: this month, the prior 11 months, recent years, and
// all-time. Each entry carries the {from, to} range (null = unbounded).
export function buildPeriods(d = new Date()) {
  const iso = (x) => x.toISOString().slice(0, 10)
  const y = d.getFullYear()
  const m = d.getMonth()
  const out = []
  for (let i = 0; i < 12; i++) {
    const start = new Date(y, m - i, 1)
    const end = new Date(y, m - i + 1, 0)
    out.push({
      value: `m:${start.getFullYear()}-${start.getMonth() + 1}`,
      label: i === 0 ? 'This month' : start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      from: iso(start), to: iso(end),
    })
  }
  for (let i = 0; i < 4; i++) {
    const yr = y - i
    out.push({ value: `y:${yr}`, label: i === 0 ? 'This year' : String(yr), from: `${yr}-01-01`, to: `${yr}-12-31` })
  }
  out.push({ value: 'all', label: 'All time', from: null, to: null })
  return out
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
