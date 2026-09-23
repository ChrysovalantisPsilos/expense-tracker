import { toBaseMinor, minorFactor, baseEquivalent } from '../../shared/lib/currency.js'
import { bucketOf, sumToBaseByKey } from '../../shared/lib/txnRollup.js'
import { categoryBars } from '../dashboard/categoryBars.js'

// Income/expense trend in MAJOR base-currency units, one entry per month bucket
// (keyed by YYYY-MM). `months` come from lastMonths(); rows outside those months
// are ignored. Values are major units so the chart axis reads naturally. Pass
// spendRows output (shared/lib/spread.js) so a yearly subscription counts its
// monthly share in each month.
export function buildTrend(rows, months, baseCurrency) {
  const factor = minorFactor(baseCurrency)
  const by = new Map(months.map((m) => [m.key, { label: m.label, income: 0, expense: 0 }]))
  for (const r of rows) {
    const key = String(r.spent_at).slice(0, 7)
    const bucket = by.get(key)
    if (!bucket) continue
    const base = toBaseMinor(r.amount_minor, r.exchange_rate, r.currency, baseCurrency) / factor
    if (r.kind === 'income') bucket.income += base
    else bucket.expense += base
  }
  return [...by.values()]
}

// Percent change in spend from the previous month to the latest one, or null
// when there's no prior month or it had zero spend (avoids divide-by-zero).
export function spendDelta(trend) {
  const thisM = trend[trend.length - 1]
  const lastM = trend[trend.length - 2]
  if (!thisM || !lastM || lastM.expense <= 0) return null
  return Math.round(((thisM.expense - lastM.expense) / lastM.expense) * 100)
}

// Split account balances (minor units) into assets vs liabilities, plus net.
export function netWorth(accounts) {
  let assets = 0, liabilities = 0
  for (const acc of accounts) {
    if (acc.type === 'liability') liabilities += acc.balance_minor
    else assets += acc.balance_minor
  }
  return { assets, liabilities, net: assets - liabilities }
}

// A savings goal's progress: `pct` (0–100, whole), `done` once the target is
// reached, and `step` — the quick-add increment, a tenth of the target (≥ 1
// minor unit).
export function goalProgress({ saved_minor: saved, target_minor: target }) {
  return {
    pct: target > 0 ? Math.min(100, Math.round((saved / target) * 100)) : 0,
    done: target > 0 && saved >= target,
    step: Math.max(1, Math.round(target / 10)),
  }
}

// The saved amount after a quick add/remove of `deltaMinor`; never below zero.
export function goalSavedAfter(goal, deltaMinor) {
  return Math.max(0, goal.saved_minor + deltaMinor)
}

// Y-axis tick label for the trend chart (major units): "800", "1.6k", "2.4k",
// "120k", "1.5M". One decimal keeps neighbouring ticks distinct, where whole
// thousands would print 1.6k and 2.4k both as "2k".
const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })
export const axisTick = (v) => compact.format(v).replace(/K$/, 'k')

// Expense rows (anything not income) dated in the `monthKey` (YYYY-MM) month.
const monthExpenses = (rows, monthKey) =>
  rows.filter((r) => r.kind !== 'income' && String(r.spent_at).slice(0, 7) === monthKey)

// "Where your money went": the month's spending by category as StackedBar /
// ShareLegend items [{ label, share }] — top 5 + "Other", integer shares that
// sum to 100, "Other" last. Buckets and converts exactly like the dashboard breakdown
// (bucketOf + sumToBaseByKey, then categoryBars). [] when nothing was spent.
export function spendingShares(rows, monthKey, baseCurrency) {
  const totals = sumToBaseByKey(monthExpenses(rows, monthKey), baseCurrency, bucketOf)
  const categories = [...totals.entries()].map(([name, value]) => ({ name, value }))
  return categoryBars(categories).map((c) => ({ label: c.name, share: c.share }))
}

// "Spending abroad": the month's foreign-currency expenses with their value
// in the base currency at each row's captured rate (baseEquivalent), newest
// first as given, plus the base-currency total. Rows in the base currency or
// without a rate are left out, so { items: [], totalBaseMinor: 0 } means
// there's nothing to show.
//   items: [{ id, label, currency, minor, rate, baseMinor }]
export function foreignSpending(rows, monthKey, baseCurrency) {
  const items = []
  for (const r of monthExpenses(rows, monthKey)) {
    const conv = baseEquivalent(r.amount_minor, r.exchange_rate, r.currency, baseCurrency)
    if (!conv) continue
    items.push({
      id: r.id, label: r.description || r.categories?.name || 'Expense',
      currency: r.currency, minor: r.amount_minor, rate: conv.rate, baseMinor: conv.baseMinor,
    })
  }
  return { items, totalBaseMinor: items.reduce((sum, i) => sum + i.baseMinor, 0) }
}
