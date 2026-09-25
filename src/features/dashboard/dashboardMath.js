// Pure maths behind the Overview page's headline figures. Money is integer
// minor units in the user's base currency.
import { toBaseMinor } from '../../shared/lib/currency.js'
import { bucketOf, sumToBaseByKey } from '../../shared/lib/txnRollup.js'
import { expectedInWindow } from '../recurring/recurringMath.js'

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
// "all time" (no end) stay purely actual. `separateYearly`: the user keeps
// yearly subscriptions out of monthly spending (0068); `salaryShift`: salary
// due late in the month counts toward the next (0081).
export function periodProjection(rules, periodTo, todayISO, separateYearly = false, salaryShift = null) {
  if (!periodTo || periodTo < todayISO) return { expense: 0, income: 0 }
  return expectedInWindow(rules, todayISO, periodTo, separateYearly, salaryShift)
}

// Headline figures: actual totals plus the projection, and the net.
export function projectedTotals({ spent, earned }, proj) {
  const spentTotal = spent + proj.expense
  const earnedTotal = earned + proj.income
  return { spentTotal, earnedTotal, netTotal: earnedTotal - spentTotal }
}
