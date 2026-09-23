import { useEffect } from 'react'
import { supabase } from '../../shared/lib/supabase.js'
import { useLiveQuery, useOwnedQuery } from '../../shared/lib/db.js'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { useProfile } from '../../shared/lib/ProfileProvider.jsx'
import { fillPendingRates } from '../../shared/lib/fx.js'

// Categories for the current user (optionally filtered by kind).
export function useCategories(kind) {
  const { rows: categories, loading, reload } = useOwnedQuery('categories', {
    build: (q) => {
      q = q.eq('is_archived', false).order('name')
      return kind ? q.eq('kind', kind) : q
    },
    deps: [kind],
  })
  return { categories, loading, reload }
}

// Transactions in a date range (defaults to current month). Optional
// `categoryId` and `limit` narrow the query server-side (used by search).
// `mutate` lets callers optimistically update the list (edit/delete).
//
// Amounts, descriptions and notes are encrypted at rest, so rows come from the
// decrypting `my_transactions` RPC (newest first; same-day rows tie-break by
// insertion time). Each row keeps the old select's shape: `categories` and,
// for mirrored group expenses, `group_expenses.groups.name` (so the dashboard
// can bucket them under the group). Realtime still watches the base table.
// A row whose rate the server hasn't filled in yet comes back with the ECB
// rate for its date and `rate_estimated: true` (see fillPendingRates).
//
// `spread: true` (monthly-spend views) also returns the yearly-subscription
// rows paid before `from` that still count in the range (spread_months, 0067):
// feed the rows to shared/lib/spread.js — spendRows for totals, paidInWindow
// for what to list.
export function useTransactions({ kind, from, to, categoryId, limit, spread = false } = {}) {
  const { baseCurrency } = useProfile()
  return useOwnedQuery('transactions', {
    fetch: () => listTransactions({ kind, from, to, categoryId, limit, spread, baseCurrency }),
    deps: [kind, from, to, categoryId, limit, spread, baseCurrency],
  })
}

// One-shot read behind useTransactions (same filters, same row shape). Pass
// `baseCurrency` to have pending rates estimated.
export async function listTransactions({ kind, from, to, categoryId, limit, spread = false, baseCurrency } = {}) {
  const { data, error } = await supabase.rpc('my_transactions', {
    p_kind: kind ?? null, p_from: from ?? null, p_to: to ?? null,
    p_category: categoryId ?? null, p_limit: limit ?? null, p_spread: spread,
  })
  if (error) throw new Error(error.message)
  return baseCurrency ? fillPendingRates(data ?? [], baseCurrency) : data ?? []
}

// One transaction (the transaction page), same row shape as useTransactions.
// `known` is the row the list already had (router state): used as is, so
// opening an entry costs no request. Opened from a bare link or a reload, it's
// looked up in the user's history — the same decrypting read, so it is
// served from the offline cache too. `row` is null when there's no such entry.
export function useTransaction(id, known) {
  const { baseCurrency } = useProfile()
  const { data, loading, error, reload } = useLiveQuery(
    async () => known ?? (await listTransactions({ baseCurrency })).find((r) => r.id === id) ?? null,
    { deps: [id, baseCurrency], enabled: !!id, initial: null, keepPrevious: false })
  return { row: data, loading: !!id && loading, error, reload }
}

// How many transactions the user has in total (a cheap head count).
export async function countTransactions() {
  const { count, error } = await supabase
    .from('transactions').select('id', { count: 'exact', head: true })
  if (error) throw new Error(error.message)
  return count ?? 0
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

// Every category the user has, archived ones included (backup/restore).
export async function listAllCategories() {
  const { data, error } = await supabase
    .from('categories').select('id, name, kind, icon, color, is_archived').order('name')
  if (error) throw new Error(error.message)
  return data ?? []
}

// Create categories (name, kind, icon, color, is_archived). Plain columns, so
// a direct insert; RLS checks user_id is the caller's own.
export async function createCategories(userId, rows) {
  if (!rows.length) return
  const { error } = await supabase.from('categories')
    .insert(rows.map((r) => ({ ...r, user_id: userId })))
  if (error) throw new Error(error.message)
}

// One-time default-category seed after first login.
async function ensureSeeded() {
  const { count, error } = await supabase
    .from('categories')
    .select('id', { count: 'exact', head: true })
  if (error) throw new Error(error.message)
  if ((count ?? 0) === 0) {
    const { error: seedErr } = await supabase.rpc('seed_default_categories')
    if (seedErr) throw new Error(seedErr.message)
  }
}

// App-bootstrap hook: make sure the signed-in user has the default categories
// (once per user id). Best effort — a failure just means no defaults yet, and
// the next app load tries again.
export function useEnsureDefaultCategories() {
  const { user } = useAuth()
  const uid = user?.id
  useEffect(() => {
    if (uid) ensureSeeded().catch((e) => console.warn('[categories] seeding failed', e))
  }, [uid])
}
