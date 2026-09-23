// Spreading a yearly subscription over the months it covers (pure, no I/O).
// One copy for the client and the edge functions: src/shared/lib/spread.js
// re-exports this module, and generate-report's statement imports it, so the
// app's monthly figures and the PDF/Excel statement split to the same cent.
//
// A yearly (every-N-years) recurring EXPENSE is paid once but counts evenly in
// monthly spend: a €120 charge on 15 Mar counts €10 in each month from March
// to the following February. The server marks such rows with `spread_months`
// (migration 0067: 12·N, at most 120); only monthly-spend maths uses it —
// budgets, the Overview totals/bars/projection, Insights, the statement's
// totals and the weekly digest. Lists keep the real payment on its real date.
//
// JS↔SQL LOCKSTEP PAIR: spreadPart ≡ public.spread_part, the month index ≡
// public.month_share, spreadDates ≡ public.spread_part_date (0070),
// ruleSpreadMonths ≡ public.recurring_spread_months. The server's budget
// alerts and digest must agree with the app to the cent, so any change here
// changes those SQL functions too (and vice versa).
//
// "Keep yearly subscriptions separate" (profiles.yearly_separate, 0068): when
// a user turns it on, spread rows are left out of monthly spend altogether
// (they show in Home's "Yearly subscriptions" card and the statement's own
// section instead). countsMonthly ≡ public.counts_in_month (0068).

import { toBaseMinor } from './money.ts'

// deno-lint-ignore no-explicit-any
type Row = any

const MAX_SPREAD = 120

// Months a rule's charges spread over, or null when they don't (only yearly
// expense rules do).
export function ruleSpreadMonths(
  { frequency, interval_n: n = 1, kind = 'expense' }: { frequency: string; interval_n?: number | null; kind?: string },
): number | null {
  if (frequency !== 'yearly' || kind !== 'expense') return null
  return Math.min(12 * Math.max(1, Number(n) || 1), MAX_SPREAD)
}

// Part `idx` (0-based) of `total` integer minor units over `n` months: equal
// integer parts, the remainder one unit each to the earliest months, so the
// parts always sum to exactly `total` (and stay integral for zero-decimal
// currencies). Outside 0..n-1 the part is 0.
export function spreadPart(total: number, n: number, idx: number): number {
  if (idx < 0 || idx >= n) return 0
  const q = Math.trunc(total / n) || 0 // no -0
  const r = total - q * n // carries the sign, like SQL's %
  return q + (idx < Math.abs(r) ? Math.sign(r) : 0)
}

const pad2 = (x: number) => String(x).padStart(2, '0')

// The dates a spread row's parts fall on: the payment date, then the same day
// of each following month (clamped to shorter months: 31 Jan → 28 Feb, 31 Mar
// — every date is taken from the payment's day, not the previous clamp).
// Month i is always payment month + i, as in SQL month_share; the date is
// SQL's spent_at + i months (spread_part_date).
export function spreadDates(spentAt: string, n: number): string[] {
  const [y, m, d] = spentAt.split('-').map(Number)
  return Array.from({ length: n }, (_, i) => {
    const mi = m - 1 + i
    const yy = y + Math.floor(mi / 12)
    const mm = (mi % 12) + 1
    const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate()
    return `${yy}-${pad2(mm)}-${pad2(Math.min(d, last))}`
  })
}

// A yearly-subscription row: an expense the server marked as spread.
export const isSpread = (r: Row): boolean => r.kind === 'expense' && r.spread_months >= 2

// Does this row count in monthly spend? Everything does, except a spread
// (yearly-subscription) expense when the user keeps those separate.
// JS↔SQL LOCKSTEP: ≡ public.counts_in_month(spread_months, yearly_separate).
export const countsMonthly = (row: Row, separateYearly = false): boolean => !(separateYearly && isSpread(row))

// Does a recurring rule's upcoming charge count in monthly spend? The rule-side
// twin of countsMonthly: its charges will be spread rows exactly when
// ruleSpreadMonths says so (the 0067 trigger derives them from the rule).
export const ruleCountsMonthly = (rule: Row, separateYearly = false): boolean =>
  !(separateYearly && ruleSpreadMonths(rule))

const inWindow = (date: string, from: string | null, to: string | null) =>
  (!from || date >= from) && (!to || date <= to)

// A transaction list trimmed to the rows actually paid in [from, to] (either
// bound may be null). A fetch with `spread: true` also returns earlier spread
// rows that only count towards the window's totals; lists show this instead.
export const paidInWindow = (rows: Row[], from: string | null, to: string | null): Row[] =>
  rows.filter((r) => inWindow(r.spent_at, from, to))

// Rows for monthly-spend maths over [from, to]: every non-spread row paid in
// the window as is, and each spread expense replaced by its parts that fall in
// the window. A part is a copy of its row already in the base currency
// (amount_minor = the part, exchange_rate 1, currency = base) dated on its
// month's day, so the existing sums (toBaseMinor, bucketOf, month keys) need
// no special case and add up to the cent with the server's month_share.
// `separateYearly` (the user's 0068 setting) drops spread rows instead
// (countsMonthly).
export function spendRows(
  rows: Row[], baseCurrency: string, from: string | null = null, to: string | null = null,
  { separateYearly = false }: { separateYearly?: boolean } = {},
): Row[] {
  const out: Row[] = []
  for (const r of rows) {
    if (!countsMonthly(r, separateYearly)) continue
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
export function monthlyShare(row: Row): { perMonth: number; months: number; exact: boolean } | null {
  if (!isSpread(row)) return null
  const n = row.spread_months
  const total = Number(row.amount_minor) || 0
  const perMonth = spreadPart(total, n, 0)
  return { perMonth, months: n, exact: perMonth === spreadPart(total, n, n - 1) }
}

// ---------------------------------------------------------------------------
// Rule costs (the Recurring page, Home's "Yearly subscriptions" card and the
// statement's "Yearly subscriptions" section).
// ---------------------------------------------------------------------------

// Average months-per-period, used to normalise every rule to a monthly cost.
const MONTHLY_FACTOR: Record<string, number> = { daily: 365 / 12, weekly: 52 / 12, monthly: 1, yearly: 1 / 12 }

// A rule's cost expressed in monthly minor units (for the "per month" total).
export function monthlyMinor(rule: Row): number {
  const perPeriod = rule.amount_minor / (rule.interval_n || 1)
  return Math.round(perPeriod * MONTHLY_FACTOR[rule.frequency])
}

// What a rule costs per year, in minor units of its own currency: its charge
// ÷ N for every-N-years (an every-2-years €100 counts €50 a year).
export const perYearMinor = (rule: Row): number =>
  Math.round(rule.amount_minor / Math.max(1, Number(rule.interval_n) || 1))

// The active yearly expense rules that still have a charge to come, soonest
// first, and what they cost:
//   perYear   Σ perYearMinor
//   perMonth  Σ monthlyMinor — the same per-rule rounding the Recurring page's
//             monthly figures use, so every page agrees
// Rules carry no exchange rate, so amounts are summed at face value.
export function yearlyRules(rules: Row[]): { rules: Row[]; perYear: number; perMonth: number } {
  const yearly = rules
    .filter((r) => r.is_active && ruleSpreadMonths(r) && (!r.end_date || r.next_run <= r.end_date))
    .sort((a, b) => (a.next_run < b.next_run ? -1 : a.next_run > b.next_run ? 1 : 0))
  let perYear = 0
  let perMonth = 0
  for (const r of yearly) {
    perYear += perYearMinor(r)
    perMonth += monthlyMinor(r)
  }
  return { rules: yearly, perYear, perMonth }
}
