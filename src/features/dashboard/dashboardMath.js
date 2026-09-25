// Pure maths behind the Overview page's headline figures. Money is integer
// minor units in the user's base currency.
import { formatMoney, toBaseMinor } from '../../shared/lib/currency.js'
import { bucketOf, sumToBaseByKey } from '../../shared/lib/txnRollup.js'
import { rowEffect, withoutSavings } from '../../shared/lib/savings.js'
import { expectedInWindow } from '../recurring/recurringMath.js'

const NO_SAVINGS = new Set()

// A period's totals from its rows: `spent` and `earned` (base currency);
// `saved` (every savings entry, 0084 — never part of `earned`) and
// `savedFromIncome` (the part of it taken from income, which lowers the net);
// `byCategory` (expense bucket totals, largest first) and `bucketRow` (bucket
// name → one row in it, for its icon). Pass spendRows(...) output (shared/
// lib/spread.js), so a yearly subscription counts only its share of the
// period, and the user's savings category ids (savingsIdsOf).
export function periodTotals(rows, baseCurrency, savingsIds = NO_SAVINGS) {
  let spent = 0
  let earned = 0
  let saved = 0
  let savedFromIncome = 0
  const expenses = []
  const bucketRow = new Map()
  for (const r of rows) {
    const base = toBaseMinor(r.amount_minor, r.exchange_rate, r.currency, baseCurrency)
    const effect = rowEffect(r, savingsIds)
    if (effect === 'income') earned += base
    else if (effect === 'expense') {
      spent += base
      expenses.push(r)
      if (!bucketRow.has(bucketOf(r))) bucketRow.set(bucketOf(r), r)
    } else {
      saved += base
      if (effect === 'saved-from-income') savedFromIncome += base
    }
  }
  const byCategory = [...sumToBaseByKey(expenses, baseCurrency, bucketOf).entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
  return { spent, earned, saved, savedFromIncome, byCategory, bucketRow }
}

const NOTHING_AHEAD = { expense: 0, income: 0, savedFromIncome: 0 }

// Recurring charges still to come in a period, folded into its projection —
// only while the period is ongoing (it ends today or later). Past periods and
// "all time" (no end) stay purely actual. `separateYearly`: the user keeps
// yearly subscriptions out of monthly spending (0068); `salaryShift`: salary
// due late in the month counts toward the next (0081). Recurring savings
// (rules in a savings category, 0084) are never upcoming income; the ones
// taken from income come back as `savedFromIncome`, which lowers the net.
export function periodProjection(rules, periodTo, todayISO, separateYearly = false, salaryShift = null,
  savingsIds = NO_SAVINGS) {
  if (!periodTo || periodTo < todayISO) return NOTHING_AHEAD
  const ahead = (list) => expectedInWindow(list, todayISO, periodTo, separateYearly, salaryShift)
  const fromIncome = rules.filter((r) => rowEffect(r, savingsIds) === 'saved-from-income')
  return {
    ...ahead(withoutSavings(rules, savingsIds)),
    savedFromIncome: fromIncome.length ? ahead(fromIncome).income : 0,
  }
}

// Headline figures: actual totals plus the projection, and the net — income
// − expenses − savings taken from income (received savings leave it alone).
export function projectedTotals({ spent, earned, savedFromIncome = 0 }, proj) {
  const spentTotal = spent + proj.expense
  const earnedTotal = earned + proj.income
  const fromIncomeTotal = savedFromIncome + (proj.savedFromIncome ?? 0)
  return { spentTotal, earnedTotal, fromIncomeTotal, netTotal: earnedTotal - spentTotal - fromIncomeTotal }
}

// The Net tile's note: what's folded in ("incl. upcoming recurring"), else
// what it is — with "− savings" once some savings were taken from income.
export function netNote(proj, fromIncomeTotal) {
  if (proj.expense > 0 || proj.income > 0 || proj.savedFromIncome > 0) return 'incl. upcoming recurring'
  return fromIncomeTotal > 0 ? 'income − expenses − savings' : 'income − expenses'
}

// The Overview's note on a period's savings (both kinds) — "Saved €300.00
// this month", "… in March 2025", "… in 2025", "… in total" (all time) — or
// null when nothing was saved in it.
export function savedNote(saved, period, baseCurrency) {
  if (!(saved > 0)) return null
  const label = String(period?.label ?? '')
  const when = period?.value === 'all' ? 'in total'
    : /^This /.test(label) ? label.toLowerCase() : `in ${label}`
  return `Saved ${formatMoney(saved, baseCurrency)} ${when}`
}
