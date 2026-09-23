import { toBaseMinor } from './currency.js'

// Spreading a yearly subscription over the months it covers (pure, no I/O).
//
// A yearly (every-N-years) recurring EXPENSE is paid once but counts evenly in
// monthly spend: a €120 charge on 15 Mar counts €10 in each month from March
// to the following February. The server marks such rows with `spread_months`
// (migration 0067: 12·N, at most 120); only monthly-spend maths uses it —
// budgets, the Overview totals/bars/projection, Insights. Lists and the
// statement keep the real payment on its real date.
//
// JS↔SQL LOCKSTEP PAIR: spreadPart ≡ public.spread_part, the month index ≡
// public.month_share, ruleSpreadMonths ≡ public.recurring_spread_months. The
// server's budget alerts must agree with the budget bars to the cent, so any
// change here changes 0067's functions too (and vice versa).

const MAX_SPREAD = 120

// Months a rule's charges spread over, or null when they don't (only yearly
// expense rules do).
export function ruleSpreadMonths({ frequency, interval_n: n = 1, kind = 'expense' }) {
  if (frequency !== 'yearly' || kind !== 'expense') return null
  return Math.min(12 * Math.max(1, Number(n) || 1), MAX_SPREAD)
}

// Part `idx` (0-based) of `total` integer minor units over `n` months: equal
// integer parts, the remainder one unit each to the earliest months, so the
// parts always sum to exactly `total` (and stay integral for zero-decimal
// currencies). Outside 0..n-1 the part is 0.
export function spreadPart(total, n, idx) {
  if (idx < 0 || idx >= n) return 0
  const q = Math.trunc(total / n) || 0 // no -0
  const r = total - q * n // carries the sign, like SQL's %
  return q + (idx < Math.abs(r) ? Math.sign(r) : 0)
}

const pad2 = (x) => String(x).padStart(2, '0')

// The dates a spread row's parts fall on: the payment date, then the same day
// of each following month (clamped to shorter months: 31 Jan → 28 Feb, 31 Mar
// — every date is taken from the payment's day, not the previous clamp).
// Month i is always payment month + i, as in SQL month_share.
export function spreadDates(spentAt, n) {
  const [y, m, d] = spentAt.split('-').map(Number)
  return Array.from({ length: n }, (_, i) => {
    const mi = m - 1 + i
    const yy = y + Math.floor(mi / 12)
    const mm = (mi % 12) + 1
    const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate()
    return `${yy}-${pad2(mm)}-${pad2(Math.min(d, last))}`
  })
}

const isSpread = (r) => r.kind === 'expense' && r.spread_months >= 2

const inWindow = (date, from, to) => (!from || date >= from) && (!to || date <= to)

// A transaction list trimmed to the rows actually paid in [from, to] (either
// bound may be null). A fetch with `spread: true` also returns earlier spread
// rows that only count towards the window's totals; lists show this instead.
export const paidInWindow = (rows, from, to) => rows.filter((r) => inWindow(r.spent_at, from, to))

// Rows for monthly-spend maths over [from, to]: every non-spread row paid in
// the window as is, and each spread expense replaced by its parts that fall in
// the window. A part is a copy of its row already in the base currency
// (amount_minor = the part, exchange_rate 1, currency = base) dated on its
// month's day, so the existing sums (toBaseMinor, bucketOf, month keys) need
// no special case and add up to the cent with the server's month_share.
export function spendRows(rows, baseCurrency, from = null, to = null) {
  const out = []
  for (const r of rows) {
    if (!isSpread(r)) {
      if (inWindow(r.spent_at, from, to)) out.push(r)
      continue
    }
    const n = r.spread_months
    const total = toBaseMinor(r.amount_minor, r.exchange_rate, r.currency, baseCurrency)
    spreadDates(r.spent_at, n).forEach((date, i) => {
      if (!inWindow(date, from, to)) return
      out.push({
        ...r, amount_minor: spreadPart(total, n, i), currency: baseCurrency, exchange_rate: 1,
        spent_at: date,
      })
    })
  }
  return out
}

// What a spread expense costs per month, in its own currency:
// { perMonth, months, exact } (exact: every month's part is the same, so the
// UI can drop its "≈"), or null when the row isn't spread.
export function monthlyShare(row) {
  if (!isSpread(row)) return null
  const n = row.spread_months
  const total = Number(row.amount_minor) || 0
  const perMonth = spreadPart(total, n, 0)
  return { perMonth, months: n, exact: perMonth === spreadPart(total, n, n - 1) }
}
