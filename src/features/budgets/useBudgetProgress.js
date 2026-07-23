import { useMemo } from 'react'
import { useOwnedQuery } from '../../shared/lib/db.js'
import { useTransactions } from '../transactions/useData.js'
import { monthRange } from '../../shared/lib/dates.js'
import { useProfile } from '../../shared/lib/useProfile.js'
import { toBaseMinor } from '../../shared/lib/currency.js'

// This month's budgets with their actual spend, for the dashboard card.
// Budgets are stored in the base currency; spend is converted to base too, so
// they're directly comparable. Both queries are live (realtime).
export function useBudgetProgress() {
  const { baseCurrency } = useProfile()
  const { from, to } = monthRange()

  const { rows: budgets, loading: bLoading } = useOwnedQuery('budgets', {
    select: '*, categories(name, icon)',
    build: (q) => q.eq('period_start', from),
    deps: [from],
  })
  const { rows: txns, loading: tLoading } = useTransactions({ kind: 'expense', from, to })

  const items = useMemo(() => {
    const spentByCat = new Map()
    for (const r of txns) {
      if (!r.category_id) continue
      const base = toBaseMinor(r.amount_minor, r.exchange_rate, r.currency, baseCurrency)
      spentByCat.set(r.category_id, (spentByCat.get(r.category_id) ?? 0) + base)
    }
    return budgets
      .map((b) => ({
        id: b.id,
        name: b.categories?.name ?? 'Category',
        limit: b.amount_minor,
        spent: spentByCat.get(b.category_id) ?? 0,
      }))
      // Most-used budgets first (over-budget floats to the top).
      .sort((a, b) => (b.spent / (b.limit || 1)) - (a.spent / (a.limit || 1)))
  }, [budgets, txns, baseCurrency])

  return { items, loading: bLoading || tLoading }
}
