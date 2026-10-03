import { supabase } from '../../shared/lib/supabase.js'
import { useOwnedQuery } from '../../shared/lib/db.js'
import { useProfile } from '../../shared/lib/ProfileProvider.jsx'
import { periodMonth, thisMonthPeriod } from '../../shared/lib/periods.js'
import { dbError } from '../../shared/lib/errors.js'
import { monthSets, setPeriods } from './budgetMath.js'

// A month's budget rows for the signed-in user (live via realtime; defaults to
// this month: the pay month holding today with the salary setting on). Caps are encrypted at rest, so reads go through the decrypting
// my_budgets RPC; realtime still subscribes to the base `budgets` table.
// period_start (first day of the month) is the budget period key. Budgets roll
// forward: a month without its own rows gets the latest earlier month's, whose
// period_start then names that month (budgetMath.carriedFrom).
export function useMonthBudgets(month) {
  const { payCalendar: cal } = useProfile()
  const periodStart = month ?? periodMonth(thisMonthPeriod(new Date(), cal))
  const q = useOwnedQuery('budgets', {
    cacheAs: 'budgets', fetch: () => listBudgets(periodStart), deps: [periodStart],
  })
  return { ...q, periodStart }
}

// One month's effective budgets (decrypted, rolled forward), keyed by its first day.
export async function listBudgets(periodStart) {
  const { data, error } = await supabase.rpc('my_budgets', { p_period: periodStart })
  if (error) throw dbError(error)
  return data ?? []
}

// The budget sets behind a run of months (budgetMath.budgetWindow's first/last,
// 'YYYY-MM-01'; first null: from the start), live: each month with rows of its
// own as { period, rows }, including the earlier one the first month carries
// over. A single month is one my_budgets read (served offline too); a longer
// run reads which months have budgets, then each of those months' caps.
export function useBudgetSets(first, last) {
  const q = useOwnedQuery('budgets', {
    cacheAs: 'budget-sets', fetch: () => listBudgetSets(first, last), deps: [first, last],
  })
  return { ...q, sets: q.rows }
}

async function listBudgetSets(first, last) {
  if (first && first === last) return monthSets(await listBudgets(first))
  const periods = setPeriods(await budgetPeriods(), first, last)
  return Promise.all(periods.map(async (period) => ({ period, rows: await listBudgets(period) })))
}

// Every month the user has set any budget for (plain columns, no amounts).
export async function budgetPeriods() {
  const { data, error } = await supabase.from('budgets').select('period_start')
  if (error) throw dbError(error)
  return [...new Set((data ?? []).map((b) => b.period_start))].sort()
}

// Insert or update exactly one month's row for a category (backup restore). The
// save_budget RPC encrypts the amount and upserts on that key. The Budgets
// page uses editBudget instead, which keeps the month's carried caps.
export async function saveBudget({ categoryId, amountMinor, currency, periodStart }) {
  const { error } = await supabase.rpc('save_budget', {
    p_category: categoryId,
    p_amount: amountMinor,
    p_currency: currency,
    p_period: periodStart,
  })
  if (error) throw dbError(error)
}

// The Budgets page's "set a cap": a month still showing carried-over caps
// first gets its own copy of them, then this one changes (edit_budget RPC).
export async function editBudget({ categoryId, amountMinor, currency, periodStart }) {
  const { error } = await supabase.rpc('edit_budget', {
    p_category: categoryId, p_amount: amountMinor, p_currency: currency, p_period: periodStart,
  })
  if (error) throw dbError(error)
}

// Remove a category's cap from this month (and the months that carry it).
export async function deleteBudget({ categoryId, periodStart }) {
  const { error } = await supabase.rpc('delete_budget', { p_category: categoryId, p_period: periodStart })
  if (error) throw dbError(error)
}

// "Copy last month's budgets": this month's caps become last month's. Returns
// how many were copied.
export async function copyPreviousBudgets(periodStart) {
  const { data, error } = await supabase.rpc('copy_previous_budgets', { p_period: periodStart })
  if (error) throw dbError(error)
  return data ?? 0
}
