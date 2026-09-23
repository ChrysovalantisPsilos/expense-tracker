// Pure maths behind the Overview page's headline figures. Money is integer
// minor units in the user's base currency.
import { toBaseMinor } from '../../shared/lib/currency.js'
import { bucketOf, sumToBaseByKey } from '../../shared/lib/txnRollup.js'
import { monthlyMinor, expectedInWindow } from '../recurring/recurringMath.js'

// A period's totals from its rows: `spent` and `earned` (base currency),
// `byCategory` (bucket totals, largest first) and `bucketRow` (bucket name →
// one row in it, for its icon). Pass spendRows(...) output (shared/lib/
// spread.js), so a yearly subscription counts only its share of the period.
export function periodTotals(rows, baseCurrency) {
  let spent = 0
  let earned = 0
  const expenses = []
  const bucketRow = new Map()
  for (const r of rows) {
    const base = toBaseMinor(r.amount_minor, r.exchange_rate, r.currency, baseCurrency)
    if (r.kind === 'income') earned += base
    else {
      spent += base
      expenses.push(r)
      if (!bucketRow.has(bucketOf(r))) bucketRow.set(bucketOf(r), r)
    }
  }
  const byCategory = [...sumToBaseByKey(expenses, baseCurrency, bucketOf).entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
  return { spent, earned, byCategory, bucketRow }
}

// Recurring charges still to come in a period, folded into its projection —
// only while the period is ongoing (it ends today or later). Past periods and
// "all time" (no end) stay purely actual.
export function periodProjection(rules, periodTo, todayISO) {
  if (!periodTo || periodTo < todayISO) return { expense: 0, income: 0 }
  return expectedInWindow(rules, todayISO, periodTo)
}

// Headline figures: actual totals plus the projection, and the net.
export function projectedTotals({ spent, earned }, proj) {
  const spentTotal = spent + proj.expense
  const earnedTotal = earned + proj.income
  return { spentTotal, earnedTotal, netTotal: earnedTotal - spentTotal }
}

// Active recurring rules, soonest charge first, and the monthly cost of the
// active expense ones (subscriptions). Ignores the period filter: recurring
// is forward-looking.
export function recurringOverview(rules) {
  const active = rules.filter((r) => r.is_active)
  return {
    subsMonthly: active.reduce((s, r) => s + (r.kind !== 'income' ? monthlyMinor(r) : 0), 0),
    activeRecurring: [...active].sort((a, b) => (a.next_run < b.next_run ? -1 : 1)),
  }
}
