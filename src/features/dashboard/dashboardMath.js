// Pure maths behind the Overview page's headline figures. Money is integer
// minor units in the user's base currency.
import { formatMoney, toBaseMinor } from '../../shared/lib/currency.js'
import { bucketOf, sumToBaseByKey } from '../../shared/lib/txnRollup.js'
import { EFFECTS, isSpending, netSign, rowEffect } from '../../shared/lib/savings.js'
import { expectedInWindow } from '../recurring/recurringMath.js'

const NO_SAVINGS = new Set()

// A period's totals from its rows: `spent` and `earned` (base currency);
// `spentFromSavings` (the part of `spent` paid from savings, 0085 — still
// spending, but not against the net); `saved` (every savings entry, 0084 —
// never part of `earned`) and `savedFromIncome` (the part of it taken from
// income); `net` (income − expenses paid from income − savings taken from
// income: netSign); `byCategory` (expense bucket totals, largest first) and
// `bucketRow` (bucket name → one row in it, for its icon). Pass spendRows(...)
// output (shared/lib/spread.js), so a yearly subscription counts only its
// share of the period, and the user's savings category ids (savingsIdsOf).
export function periodTotals(rows, baseCurrency, savingsIds = NO_SAVINGS) {
  let spent = 0
  let spentFromSavings = 0
  let earned = 0
  let saved = 0
  let savedFromIncome = 0
  let net = 0
  const expenses = []
  const bucketRow = new Map()
  for (const r of rows) {
    const base = toBaseMinor(r.amount_minor, r.exchange_rate, r.currency, baseCurrency)
    const effect = rowEffect(r, savingsIds)
    net += netSign(effect) * base
    if (effect === 'income') earned += base
    else if (isSpending(effect)) {
      spent += base
      if (effect === 'expense-from-savings') spentFromSavings += base
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
  return { spent, spentFromSavings, earned, saved, savedFromIncome, net, byCategory, bucketRow }
}

const NOTHING_AHEAD = { expense: 0, income: 0, expenseFromSavings: 0, savedFromIncome: 0, net: 0 }

// Recurring charges still to come in a period, folded into its projection —
// only while the period is ongoing (it ends today or later). Past periods and
// "all time" (no end) stay purely actual. `separateYearly`: the user keeps
// yearly subscriptions out of monthly spending (0068); `salaryShift`: salary
// due late in the month counts toward the next (0081). Each rule counts by
// its effect (rowEffect), as its entries will: recurring savings (0084) are
// never upcoming income, and those taken from income come back as
// `savedFromIncome`; recurring expenses paid from savings (0085) are upcoming
// spending (`expense`, of which `expenseFromSavings`). `net` is what they all
// do to the net (netSign).
export function periodProjection(rules, periodTo, todayISO, separateYearly = false, salaryShift = null,
  savingsIds = NO_SAVINGS) {
  if (!periodTo || periodTo < todayISO) return NOTHING_AHEAD
  const by = Object.fromEntries(EFFECTS.map((effect) => {
    const list = rules.filter((r) => rowEffect(r, savingsIds) === effect)
    const ahead = list.length ? expectedInWindow(list, todayISO, periodTo, separateYearly, salaryShift) : null
    return [effect, ahead ? ahead.income + ahead.expense : 0]
  }))
  return {
    expense: by.expense + by['expense-from-savings'],
    income: by.income,
    expenseFromSavings: by['expense-from-savings'],
    savedFromIncome: by['saved-from-income'],
    net: EFFECTS.reduce((sum, effect) => sum + netSign(effect) * by[effect], 0),
  }
}

// Headline figures: actual totals (periodTotals) plus the projection
// (periodProjection), and the net — income − expenses paid from income −
// savings taken from income (received savings and expenses paid from savings
// leave it alone). `fromIncomeTotal` and `fromSavingsTotal` feed the Net
// tile's note.
export function projectedTotals(totals, proj) {
  return {
    spentTotal: totals.spent + proj.expense,
    earnedTotal: totals.earned + proj.income,
    fromIncomeTotal: totals.savedFromIncome + proj.savedFromIncome,
    fromSavingsTotal: totals.spentFromSavings + proj.expenseFromSavings,
    netTotal: totals.net + proj.net,
  }
}

// The Net tile's note: what's folded in ("incl. upcoming recurring"), else
// what it is — "excl. spending from savings" once some expenses were paid
// from savings, "− savings" once some savings were taken from income.
export function netNote(proj, fromIncomeTotal, fromSavingsTotal) {
  if (proj.expense > 0 || proj.income > 0 || proj.savedFromIncome > 0) return 'incl. upcoming recurring'
  if (fromSavingsTotal > 0) return 'excl. spending from savings'
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

// "Spending by category" lists every category (no folded "Other" on Home);
// the chart shows the top TOP_CATEGORIES until the user taps "Show all".
// Returns the rows to draw and how many more a "Show all" would add.
export const TOP_CATEGORIES = 5
export function visibleBars(bars, showAll) {
  const hidden = showAll ? 0 : Math.max(0, bars.length - TOP_CATEGORIES)
  return { rows: hidden ? bars.slice(0, TOP_CATEGORIES) : bars, hidden }
}
