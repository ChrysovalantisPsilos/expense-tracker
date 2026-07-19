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

// Transactions in a date range (defaults to current month).
export function useTransactions({ kind, from, to } = {}) {
  const { user } = useAuth()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    let q = supabase
      .from('transactions')
      .select('*, categories(name, icon)')
      .order('spent_at', { ascending: false })
    if (kind) q = q.eq('kind', kind)
    if (from) q = q.gte('spent_at', from)
    if (to) q = q.lte('spent_at', to)
    const { data } = await q
    setRows(data ?? [])
    setLoading(false)
  }, [user, kind, from, to])

  useEffect(() => { load() }, [load])
  return { rows, loading, reload: load }
}

// Month boundaries as YYYY-MM-DD strings (no Date.now dependency in callers).
export function monthRange(d = new Date()) {
  const start = new Date(d.getFullYear(), d.getMonth(), 1)
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  const iso = (x) => x.toISOString().slice(0, 10)
  return { from: iso(start), to: iso(end) }
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
