import { toBaseMinor, minorFactor } from '../../shared/lib/currency.js'

// Income/expense trend in MAJOR base-currency units, one entry per month bucket
// (keyed by YYYY-MM). `months` come from lastMonths(); rows outside those months
// are ignored. Values are major units so the chart axis reads naturally.
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
