import { useMemo } from 'react'
import { useMonthBudgets } from './budgets.js'
import { useTransactions } from '../transactions/useData.js'
import { monthRange } from '../../shared/lib/dates.js'
import { useProfile } from '../../shared/lib/ProfileProvider.jsx'
import { sumToBaseByKey } from '../../shared/lib/txnRollup.js'
import { spendRows } from '../../shared/lib/spread.js'
import { budgetTone, carriedFrom } from './budgetMath.js'

// This month's budgets with their actual spend — shared by the dashboard card
// and the Budgets page. Budgets are stored in the base currency; spend is
// converted to base too, so they're directly comparable. Both queries are live.
// A yearly subscription counts its monthly share (spread.js, the same split
// as the server's budget alerts).
// `carriedFrom` is the month the caps rolled over from (null: this month's own).
export function useBudgetProgress() {
  const { baseCurrency } = useProfile()
  const { from, to } = monthRange()

  const b = useMonthBudgets()
  const t = useTransactions({ kind: 'expense', from, to, spread: true })
  const budgets = b.rows
  const txns = t.rows

  const items = useMemo(() => {
    const spend = spendRows(txns, baseCurrency, from, to)
    const spentByCat = sumToBaseByKey(spend, baseCurrency, (r) => r.category_id ?? null)
    return budgets
      .map((b) => {
        const spent = spentByCat.get(b.category_id) ?? 0
        return {
          id: b.id,
          categoryId: b.category_id,
          category: b.categories ?? null,
          name: b.categories?.name ?? 'Category',
          limit: b.amount_minor,
          spent,
          tone: budgetTone(spent, b.amount_minor),
        }
      })
      // Most-used budgets first (over-budget floats to the top).
      .sort((a, b) => (b.spent / (b.limit || 1)) - (a.spent / (a.limit || 1)))
  }, [budgets, txns, baseCurrency, from, to])

  const reload = () => Promise.all([b.reload(), t.reload()])
  return {
    items, carriedFrom: carriedFrom(budgets, b.periodStart), periodStart: b.periodStart,
    loading: b.loading || t.loading, error: b.error ?? t.error, reload,
  }
}
