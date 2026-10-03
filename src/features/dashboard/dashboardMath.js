// Pure maths behind the Overview page's headline figures. Money is integer
// minor units in the user's base currency.
import { formatMoney, formatSigned, toBaseMinor } from '../../shared/lib/currency.js'
import { signedAmount } from '../../shared/ui/kit/kitMath.js'
import { bucketOf, groupLabel, sumToBaseByKey } from '../../shared/lib/txnRollup.js'
import { EFFECTS, isSavingsRow, isSpending, netSign, rowEffect } from '../../shared/lib/savings.js'
import { paidInWindow } from '../../shared/lib/spread.js'
import { expectedInWindow } from '../recurring/recurringMath.js'
import { isMonthPeriod } from '../../shared/lib/periods.js'
import { isRelativeLabel } from '../budgets/budgetMath.js'
import { t } from '../../shared/lib/i18n/i18n.js'

const NO_SAVINGS = new Set()

// A period's totals from its rows: `spent` and `earned` (base currency);
// `spentFromSavings` (the part of `spent` paid from savings, 0085 — still
// spending, but not against the net) and `spentWithVouchers` (the part paid
// with meal vouchers, 0097 — the same); `saved` (every savings entry, 0084 —
// never part of `earned`) and `savedFromIncome` (the part of it taken from
// income); `net` (income − expenses paid from income − savings taken from
// income: netSign); `byCategory` (expense bucket totals, largest first) and
// `bucketRow` (bucket name → one row in it, for its icon). Pass spendRows(...)
// output (shared/lib/spread.js), so a yearly subscription counts only its
// share of the period, and the user's savings category ids (savingsIdsOf).
export function periodTotals(rows, baseCurrency, savingsIds = NO_SAVINGS) {
  let spent = 0
  let spentFromSavings = 0
  let spentWithVouchers = 0
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
      if (effect === 'expense-from-vouchers') spentWithVouchers += base
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
  return { spent, spentFromSavings, spentWithVouchers, earned, saved, savedFromIncome, net, byCategory, bucketRow }
}

const NOTHING_AHEAD = { expense: 0, income: 0, expenseFromSavings: 0, savedFromIncome: 0, net: 0 }

// Recurring charges still to come in a period ({ from, to }, periods.js),
// folded into its projection — only while the period is ongoing (it ends
// today or later). Past periods and "all time" (no end) stay purely actual.
// For this month pass `to` as the projection's end (payCalendar.expectedEnd:
// with pay months, the day before the next salary is expected).
// `separateYearly`: the user keeps yearly subscriptions out of monthly
// spending (0068). Each rule counts by its effect (rowEffect), as its entries
// will: recurring savings (0084) are never upcoming income, and those taken
// from income come back as `savedFromIncome`; recurring expenses paid from
// savings (0085) are upcoming spending (`expense`, of which
// `expenseFromSavings`). `net` is what they all do to the net (netSign).
//
// With pay months on, pass `cal` (a yearly charge's parts by pay month) and
// `paidRules` (paidRuleIds): the rules with a charge
// already paid in the period. A pay month can be longer than a calendar
// month (29 Sep → 31 Oct), so a monthly charge paid on 30 Sep would
// otherwise be counted again as due on 30 Oct: a rule charged at most once a
// month that already has its charge in the period adds nothing more.
export function periodProjection(rules, { from = null, to = null } = {}, todayISO, separateYearly = false,
  savingsIds = NO_SAVINGS, { paidRules = NO_RULES, cal = null } = {}) {
  if (!to || to < todayISO) return NOTHING_AHEAD
  const start = from && from > todayISO ? from : todayISO
  const due = rules.filter((r) => !(paidRules.has(r.id) && ONCE_A_MONTH.has(r.frequency)))
  const by = Object.fromEntries(EFFECTS.map((effect) => {
    const list = due.filter((r) => rowEffect(r, savingsIds) === effect)
    const sum = list.length ? expectedInWindow(list, start, to, separateYearly, cal) : null
    return [effect, sum ? sum.income + sum.expense : 0]
  }))
  return {
    expense: EFFECTS.filter(isSpending).reduce((sum, effect) => sum + by[effect], 0),
    income: by.income,
    expenseFromSavings: by['expense-from-savings'],
    savedFromIncome: by['saved-from-income'],
    net: EFFECTS.reduce((sum, effect) => sum + netSign(effect) * by[effect], 0),
  }
}

const NO_RULES = new Set()
const ONCE_A_MONTH = new Set(['monthly', 'yearly'])

// The rules with a charge paid in [from, to] (rows: the period's
// transactions), for periodProjection's `paidRules`.
export const paidRuleIds = (rows, { from = null, to = null } = {}) =>
  new Set(paidInWindow(rows, from, to).map((r) => r.recurring_rule_id).filter(Boolean))

const NO_GROUP_FLOW = { groupsFronted: 0, groupsCovered: 0, settledIn: 0, settledOut: 0 }

// The money groups really moved in a period, for the net ("count what really
// moved", 0110): Spent counts the user's share of every group expense, as if
// everyone had already paid each other back, so the net adjusts by
//   `groupsFronted` — the rest of an expense the user paid (the total less
//                     their share): it left them too;
//   `groupsCovered` — their share of an expense someone else paid: in Spent,
//                     but no money has left them yet;
//   `settledIn` / `settledOut` — settlements paid to / by them.
// Positive minor units in the base currency; the net is
// + groupsCovered + settledIn − groupsFronted − settledOut. Once everything is
// settled they cancel out. `moves` are my_group_flow's rows (amounts in the
// group currency with the user's rate, pending ones filled like the
// transactions'); each counts in the period of its date ({ from, to },
// either end null = open).
export function groupFlow(moves, baseCurrency, { from = null, to = null } = {}) {
  const out = { ...NO_GROUP_FLOW }
  for (const m of moves ?? []) {
    if ((from && m.spent_at < from) || (to && m.spent_at > to)) continue
    const base = (minor) => toBaseMinor(Number(minor ?? 0), m.exchange_rate, m.currency, baseCurrency)
    if (m.kind === 'expense') {
      if (m.paid_by_me) out.groupsFronted += base(m.amount_minor) - base(m.share_minor)
      else out.groupsCovered += base(m.share_minor)
    } else if (m.kind === 'settlement') {
      if (m.paid_by_me) out.settledOut += base(m.amount_minor)
      else out.settledIn += base(m.amount_minor)
    }
  }
  return out
}

// What a groupFlow does to the net: + paid for you + paid back to you − paid
// for others − paid back by you (Home's Net, the Insights trend's net).
export function groupFlowNet({ groupsFronted = 0, groupsCovered = 0, settledIn = 0, settledOut = 0 } = {}) {
  return groupsCovered + settledIn - groupsFronted - settledOut
}

// Headline figures: actual totals (periodTotals) plus the projection
// (periodProjection), and the net — income − expenses paid from income −
// savings taken from income (received savings and expenses paid from savings
// or with meal vouchers leave it alone), adjusted by the money groups really
// moved (`flow`: groupFlow). `fromIncomeTotal`, `fromSavingsTotal`,
// `withVouchersTotal` and the flow's four feed the ⓘ (netSteps).
export function projectedTotals(totals, proj, flow = NO_GROUP_FLOW) {
  const { groupsFronted, groupsCovered, settledIn, settledOut } = { ...NO_GROUP_FLOW, ...flow }
  return {
    spentTotal: totals.spent + proj.expense,
    earnedTotal: totals.earned + proj.income,
    fromIncomeTotal: totals.savedFromIncome + proj.savedFromIncome,
    fromSavingsTotal: totals.spentFromSavings + proj.expenseFromSavings,
    withVouchersTotal: totals.spentWithVouchers,
    groupsFronted,
    groupsCovered,
    settledIn,
    settledOut,
    netTotal: totals.net + proj.net + groupFlowNet({ groupsFronted, groupsCovered, settledIn, settledOut }),
  }
}

// What the overview's ⓘ opens, part one: what Spent and Income fold in that
// isn't logged yet (recurring entries still to come), as sentences.
export function overviewNotes({ proj }, currency) {
  const money = (minor) => ({ amount: formatMoney(minor, currency) })
  const lines = []
  if (proj.expense > 0) lines.push(t('dashboard:info.spentUpcoming', money(proj.expense)))
  if (proj.income > 0) lines.push(t('dashboard:info.incomeUpcoming', money(proj.income)))
  return lines
}

// Part two, "How Net adds up": the steps from Income to Net, signed minor
// units — Income, − Spent, + what was paid from savings or with meal
// vouchers (spending, but not from income), − savings taken from income,
// then the money groups really moved (groupFlow): − the rest of what the user
// paid for others, + their share others paid, + what was paid back to them,
// − what they paid back. Income and Spent always show; the others only when
// they happened. They add up to `netTotal` exactly (projectedTotals' figures).
export function netSteps({
  earnedTotal, spentTotal, fromSavingsTotal = 0, withVouchersTotal = 0, fromIncomeTotal = 0,
  groupsFronted = 0, groupsCovered = 0, settledIn = 0, settledOut = 0,
}) {
  const step = (key, minor) => (minor ? [{ key, minor }] : [])
  return [
    { key: 'income', minor: earnedTotal },
    { key: 'spent', minor: -spentTotal },
    ...step('fromSavings', fromSavingsTotal),
    ...step('vouchers', withVouchersTotal),
    ...step('toSavings', -fromIncomeTotal),
    ...step('groupsFronted', -groupsFronted),
    ...step('groupsCovered', groupsCovered),
    ...step('settledIn', settledIn),
    ...step('settledOut', -settledOut),
  ]
}

// Home's savings row: "+€809.40 in · −€899.00 out" when money also came out
// of savings in the period (the two numbers the Savings page shows), else
// savedNote's "Saved €809.40 this month"; null when neither happened.
export function savingsLine(saved, out, period, baseCurrency) {
  if (out > 0) {
    return t('dashboard:saved.inOut', {
      in: formatMoney(Math.max(saved, 0), baseCurrency), out: formatMoney(out, baseCurrency),
    })
  }
  return savedNote(saved, period, baseCurrency)
}

// Group spending per category: "Spending by category" gives each group its
// own row (bucketOf), while budgets count a share under its category. For
// each category name, the groups whose shares carry it and how much (base
// currency) — so a category row can say what its groups add.
export function groupSharesByCategory(rows, baseCurrency) {
  const out = new Map()
  for (const r of rows) {
    if (!r.group_expense_id || r.kind === 'income' || !r.categories?.name) continue
    const byGroup = out.get(r.categories.name) ?? new Map()
    const group = groupLabel(r)
    byGroup.set(group, (byGroup.get(group) ?? 0) + toBaseMinor(r.amount_minor, r.exchange_rate, r.currency, baseCurrency))
    out.set(r.categories.name, byGroup)
  }
  return out
}

// The overview's "How Net adds up" (SumSteps) as words: the title, each
// step's label and signed amount, and the Net with its tone.
export function netSum(figures, currency) {
  const net = signedAmount(figures.netTotal, (m) => formatMoney(m, currency))
  return {
    title: t('dashboard:info.sumTitle'),
    steps: netSteps(figures).map((s) => ({
      key: s.key, label: t(`dashboard:info.steps.${s.key}`), value: formatSigned(s.minor, currency, { plus: true }),
    })),
    total: { label: t('dashboard:info.net'), value: net.text, tone: net.tone },
  }
}

// Each bar's line under its name (categoryLine), over the period's group
// shares (`spend`: spendRows' output).
export function barLines(bars, spend, baseCurrency) {
  const shares = groupSharesByCategory(spend, baseCurrency)
  return bars.map((c) => categoryLine(c.name, c.value, shares, baseCurrency))
}

// Home's two lists for a period: the expenses and the income paid in it
// (with pay months, the period's window starts on payday, so the salary
// that opened it is listed in it). Savings aren't income, so they're not
// listed (the Transactions page has them).
export function homeLists(rows, { from = null, to = null, savingsIds = NO_SAVINGS } = {}) {
  const paid = paidInWindow(rows, from, to)
  const expenses = paid.filter((r) => r.kind !== 'income')
  const income = paid.filter((r) => r.kind === 'income' && !isSavingsRow(r, savingsIds))
  return { expenses, income }
}

// A category row's line: its amount, and when groups carry more of it,
// "· +€31.40 in Lisbon trip = €139.40" (or "in 2 groups").
export function categoryLine(name, value, shares, baseCurrency) {
  const amount = formatMoney(value, baseCurrency)
  const byGroup = shares.get(name)
  if (!byGroup) return amount
  const shared = [...byGroup.values()].reduce((s, v) => s + v, 0)
  const vars = { amount, shared: formatMoney(shared, baseCurrency), total: formatMoney(value + shared, baseCurrency) }
  return byGroup.size === 1
    ? t('dashboard:categories.withGroup', { ...vars, group: [...byGroup.keys()][0] })
    : t('dashboard:categories.withGroups', { ...vars, count: byGroup.size })
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
// Income lists (empty) are left out. Meal vouchers follow the totals (the
// card shows only for users who set them up).
export function homeCards({ firstRun }) {
  return firstRun
    ? ['overview', 'firstEntry', 'vouchers', 'categories', 'budgets', 'recurring']
    : ['overview', 'vouchers', 'categories', 'budgets', 'expenses', 'income', 'recurring']
}

// A phone held sideways: the overview is a strip across the top, and the
// other cards fall into two stacks that each flow on their own (no shared
// row heights, so a short card never leaves a hole beside a long one). The
// left holds the summaries (meal vouchers, by category, budgets); the right
// the lists (expenses, income, recurring) — or, on a first run, the way to
// start and Recurring. Together they hold every card homeCards lists, once.
export function homeStacks({ firstRun }) {
  return {
    strip: ['overview'],
    left: ['vouchers', 'categories', 'budgets'],
    right: firstRun ? ['firstEntry', 'recurring'] : ['expenses', 'income', 'recurring'],
  }
}
