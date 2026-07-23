import { supabase } from '../../shared/lib/supabase.js'
import { useOwnedQuery } from '../../shared/lib/db.js'
import { monthRange } from '../../shared/lib/dates.js'

// This month's budget rows for the signed-in user (live via realtime).
// period_start (the first day of the current month) is the budget period key.
export function useMonthBudgets() {
  const { from } = monthRange()
  const q = useOwnedQuery('budgets', {
    select: '*, categories(name, icon)',
    build: (b) => b.eq('period_start', from),
    deps: [from],
  })
  return { ...q, periodStart: from }
}

// Insert or update a category's monthly cap. There is one budget per
// (user, category, month), so upsert on that key overwrites an existing cap
// rather than erroring. user_id is stamped so the own-rows RLS check passes.
export async function saveBudget({ categoryId, amountMinor, currency, periodStart }) {
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase.from('budgets').upsert({
    user_id: user?.id,
    category_id: categoryId,
    amount_minor: amountMinor,
    currency,
    period_start: periodStart,
  }, { onConflict: 'user_id,category_id,period_start' })
  if (error) throw new Error(error.message)
}
