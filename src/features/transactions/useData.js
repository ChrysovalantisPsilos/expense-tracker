import { supabase } from '../../shared/lib/supabase.js'
import { useOwnedQuery } from '../../shared/lib/db.js'

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
export function useTransactions({ kind, from, to, categoryId, limit } = {}) {
  return useOwnedQuery('transactions', {
    fetch: async () => {
      const { data, error } = await supabase.rpc('my_transactions', {
        p_kind: kind ?? null, p_from: from ?? null, p_to: to ?? null,
        p_category: categoryId ?? null, p_limit: limit ?? null,
      })
      if (error) throw new Error(error.message)
      return data ?? []
    },
    deps: [kind, from, to, categoryId, limit],
  })
}

// Re-exported for existing callers; the implementation lives in lib/dates.js.
export { monthRange } from '../../shared/lib/dates.js'

// Period math lives in periods.js (unit-tested); re-exported for callers.
export { buildPeriods } from './periods.js'

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
