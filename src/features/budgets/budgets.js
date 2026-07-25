import { supabase } from '../../shared/lib/supabase.js'
import { useOwnedQuery } from '../../shared/lib/db.js'
import { monthRange } from '../../shared/lib/dates.js'

// This month's budget rows for the signed-in user (live via realtime). Caps are
// encrypted at rest, so reads go through the decrypting my_budgets RPC; realtime
// still subscribes to the base `budgets` table. period_start (first day of the
// current month) is the budget period key.
export function useMonthBudgets() {
  const { from } = monthRange()
  const q = useOwnedQuery('budgets', {
    fetch: async () => {
      const { data, error } = await supabase.rpc('my_budgets', { p_period: from })
      if (error) throw new Error(error.message)
      return data ?? []
    },
    deps: [from],
  })
  return { ...q, periodStart: from }
}

// Insert or update a category's monthly cap (one per user/category/month). The
// save_budget RPC encrypts the amount and upserts on that key.
export async function saveBudget({ categoryId, amountMinor, currency, periodStart }) {
  const { error } = await supabase.rpc('save_budget', {
    p_category: categoryId,
    p_amount: amountMinor,
    p_currency: currency,
    p_period: periodStart,
  })
  if (error) throw new Error(error.message)
}
