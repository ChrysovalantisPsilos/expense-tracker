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
// `withGroup` also embeds the owning group's name for mirrored group expenses,
// so the dashboard can bucket them under the group instead of Uncategorized.
// `mutate` lets callers optimistically update the list (edit/delete).
export function useTransactions({ kind, from, to, categoryId, limit, withGroup } = {}) {
  return useOwnedQuery('transactions', {
    select: withGroup
      ? '*, categories(name, icon), group_expenses(groups(name))'
      : '*, categories(name, icon)',
    build: (q) => {
      // spent_at is a bare date — tie-break same-day rows by insertion time
      // so the newest-added entry is always on top.
      q = q.order('spent_at', { ascending: false }).order('created_at', { ascending: false })
      if (kind) q = q.eq('kind', kind)
      if (from) q = q.gte('spent_at', from)
      if (to) q = q.lte('spent_at', to)
      if (categoryId) q = q.eq('category_id', categoryId)
      if (limit) q = q.limit(limit)
      return q
    },
    deps: [kind, from, to, categoryId, limit, withGroup],
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
