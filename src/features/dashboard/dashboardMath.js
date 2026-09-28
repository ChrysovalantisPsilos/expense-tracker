// Pure maths behind the Overview page's headline figures. Money is integer
// minor units in the user's base currency.
import { formatMoney, toBaseMinor } from '../../shared/lib/currency.js'
import { bucketOf, sumToBaseByKey } from '../../shared/lib/txnRollup.js'
import { EFFECTS, isSpending, netSign, rowEffect } from '../../shared/lib/savings.js'
import { expectedInWindow } from '../recurring/recurringMath.js'
import { isMonthPeriod } from '../transactions/periods.js'
import { isRelativeLabel } from '../budgets/budgetMath.js'
import { t } from '../../shared/lib/i18n/i18n.js'

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

// What the overview's ⓘ opens: what Spent and Income fold in (recurring
// entries still to come, spending paid from savings), then what the Net is —
// "− savings" once some savings were taken from income, and never the
// spending paid from savings.
export function overviewInfo(proj, fromIncomeTotal, fromSavingsTotal, currency) {
  const money = (minor) => ({ amount: formatMoney(minor, currency) })
  const lines = []
  if (proj.expense > 0) lines.push(t('dashboard:info.spentUpcoming', money(proj.expense)))
  if (fromSavingsTotal > 0) lines.push(t('dashboard:info.spentFromSavings', money(fromSavingsTotal)))
  if (proj.income > 0) lines.push(t('dashboard:info.incomeUpcoming', money(proj.income)))
  lines.push(t(fromIncomeTotal > 0 ? 'dashboard:info.netSavings' : 'dashboard:info.net'))
  if (fromSavingsTotal > 0) lines.push(t('dashboard:info.netExclSavings'))
  return lines
}

// The Overview's note on a period's savings (both kinds) — "Saved €300.00
// this month", "… this year", "… in March 2025", "… in 2025", "… in total"
// (all time) — or null when nothing was saved in it.
export function savedNote(saved, period, baseCurrency) {
  if (!(saved > 0)) return null
  const amount = formatMoney(saved, baseCurrency)
  if (period?.value === 'all') return t('dashboard:saved.total', { amount })
  if (isRelativeLabel(period)) {
    return t(isMonthPeriod(period) ? 'dashboard:saved.thisMonth' : 'dashboard:saved.thisYear', { amount })
  }
  return t('dashboard:saved.in', { amount, period: String(period?.label ?? '') })
}

// "Spending by category" lists every category (no folded "Other" on Home);
// the chart shows the top TOP_CATEGORIES until the user taps "Show all".
// Returns the rows to draw and how many more a "Show all" would add.
export const TOP_CATEGORIES = 5
export function visibleBars(bars, showAll) {
  const hidden = showAll ? 0 : Math.max(0, bars.length - TOP_CATEGORIES)
  return { rows: hidden ? bars.slice(0, TOP_CATEGORIES) : bars, hidden }
}

// Home's cards, by id, in reading order. On a first run (nothing logged
// yet) the way to start sits right under the totals, and the Expenses and
// Income lists (empty) are left out.
export function homeCards({ firstRun }) {
  return firstRun
    ? ['overview', 'firstEntry', 'categories', 'budgets', 'recurring']
    : ['overview', 'categories', 'budgets', 'expenses', 'income', 'recurring']
}

// A phone held sideways: the overview is a strip across the top, and the
// other cards fall into two stacks that each flow on their own (no shared
// row heights, so a short card never leaves a hole beside a long one). The
// left holds the summaries (by category, budgets); the right the lists
// (expenses, income, recurring) — or, on a first run, the way to start and
// Recurring. Together they hold every card homeCards lists, once.
export function homeStacks({ firstRun }) {
  return {
    strip: ['overview'],
    left: ['categories', 'budgets'],
    right: firstRun ? ['firstEntry', 'recurring'] : ['expenses', 'income', 'recurring'],
  }
}
