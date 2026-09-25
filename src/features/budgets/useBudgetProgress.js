import { useMemo } from 'react'
import { useBudgetSets } from './budgets.js'
import { useTransactions } from '../transactions/useData.js'
import { buildPeriods, isMonthPeriod } from '../transactions/periods.js'
import { today } from '../../shared/lib/dates.js'
import { useProfile } from '../../shared/lib/ProfileProvider.jsx'
import { spendRows } from '../../shared/lib/spread.js'
import { budgetWindow, capsInMonth, carriedFrom, periodBudgets } from './budgetMath.js'

// A period's budgets with their actual spend (budgetMath.periodBudgets: a
// month's caps, or a year's / all time's monthly caps added up) — shared by
// the dashboard card (Home's period) and the Budgets page (this month, the
// default). Budgets are stored in the base currency; spend is converted to
// base too, so they're directly comparable. Both queries are live.
// A yearly subscription counts its monthly share (spread.js, the same split
// as the server's budget alerts), or nothing when the user keeps yearly
// subscriptions separate (countsMonthly ≡ the alerts' counts_in_month).
// `carriedFrom` is the month a single month's caps rolled over from (null:
// its own, or a longer period); `months` how many months had any cap.
export function useBudgetProgress(period = buildPeriods(null)[0]) {
  const { baseCurrency, separateYearly } = useProfile()
  const todayISO = today()
  const { value, from: pFrom, to: pTo } = period
  const span = useMemo(
    () => budgetWindow({ value, from: pFrom, to: pTo }, todayISO), [value, pFrom, pTo, todayISO])

  const b = useBudgetSets(span.first, span.last)
  const t = useTransactions({
    kind: 'expense', from: span.from ?? undefined, to: span.to, spread: true,
  })
  const sets = b.sets
  const txns = t.rows

  const { items, months } = useMemo(() => periodBudgets({
    sets, span, baseCurrency,
    spend: spendRows(txns, baseCurrency, span.from, span.to, { separateYearly }),
  }), [sets, txns, span, baseCurrency, separateYearly])

  const reload = () => Promise.all([b.reload(), t.reload()])
  return {
    items, months,
    carriedFrom: isMonthPeriod(period) ? carriedFrom(capsInMonth(sets, span.first), span.first) : null,
    periodStart: span.last,
    loading: b.loading || t.loading, error: b.error ?? t.error, reload,
  }
}
