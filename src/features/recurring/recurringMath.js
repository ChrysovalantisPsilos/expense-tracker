// Pure recurring-rule math (no React/supabase imports — unit-testable).
import { monthlyShare, ruleSpreadMonths, spreadDates, spreadPart } from '../../shared/lib/spread.js'

export const FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly']

// Average months-per-period, used to normalise every rule to a monthly cost.
const MONTHLY_FACTOR = { daily: 365 / 12, weekly: 52 / 12, monthly: 1, yearly: 1 / 12 }

// A rule's cost expressed in monthly minor units (for the "per month" total).
export function monthlyMinor(rule) {
  const perPeriod = rule.amount_minor / (rule.interval_n || 1)
  return Math.round(perPeriod * MONTHLY_FACTOR[rule.frequency])
}

// "every month", "every 2 weeks", "every day"…
export function frequencyLabel({ frequency, interval_n = 1 }) {
  const unit = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[frequency]
  return interval_n > 1 ? `every ${interval_n} ${unit}s` : `every ${unit}`
}

// The date one recurrence step after `iso` ('YYYY-MM-DD'), exactly as the SQL
// materializer steps (run_date + make_interval): days/weeks add days; months
// and years keep the day of the month, clamped to the target month's last day
// — 31 Jan + 1 month = 28 Feb (29 in a leap year), 29 Feb + 1 year = 28 Feb.
// Each step starts from the previous (clamped) date, like the materializer,
// so 31 Jan → 28 Feb → 28 Mar: the 31st is not restored. Pure calendar
// arithmetic on UTC dates, so no time zone can shift the day.
export function nextRunAfter(iso, frequency, n = 1) {
  const [y, m, d] = iso.split('-').map(Number)
  const step = Math.max(1, Number(n) || 1)
  let date
  if (frequency === 'daily' || frequency === 'weekly') {
    date = new Date(Date.UTC(y, m - 1, d + step * (frequency === 'weekly' ? 7 : 1)))
  } else {
    const months = frequency === 'yearly' ? step * 12 : step // monthly (default)
    const first = new Date(Date.UTC(y, m - 1 + months, 1))
    const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
    date = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, lastDay)))
  }
  return date.toISOString().slice(0, 10)
}

// A new recurring rule made from a transaction ("Make recurring" / the form's
// Repeat switch): same kind, amount, currency, category, account and
// description; the next charge is one period after the transaction's date, so
// the transaction itself is the first occurrence. The server links the two
// through `source_transaction_id` (a listed row) or `source_client_uuid` (an
// entry just saved, whose id the client doesn't have). The rule stores no
// rate — each charge gets the ECB rate of its own date when it's created.
export function ruleFromTransaction(t, { frequency = 'monthly', interval_n: n = 1 } = {}) {
  return {
    kind: t.kind ?? 'expense',
    amount_minor: Number(t.amount_minor),
    currency: t.currency,
    category_id: t.category_id ?? null,
    account_id: t.account_id ?? null,
    description: t.description ?? null,
    frequency,
    interval_n: Math.max(1, Number(n) || 1),
    next_run: nextRunAfter(t.spent_at, frequency, n),
    ...(t.id ? { source_transaction_id: t.id }
      : t.client_uuid ? { source_client_uuid: t.client_uuid } : {}),
  }
}

// What a yearly expense rule's charge counts in each month's budgets:
// { perMonth, months, exact } (perMonth = the first, largest part; exact when
// every month gets the same), or null for rules that aren't spread.
export function monthlyBudgetShare(rule) {
  const n = ruleSpreadMonths(rule)
  return n ? monthlyShare({ kind: 'expense', amount_minor: rule.amount_minor, spread_months: n }) : null
}

// Can this transaction be made recurring? Not a mirrored group share (it's
// edited in its group) and not a row that already belongs to a rule.
export const canMakeRecurring = (t) => !!t && !t.group_expense_id && !t.recurring_rule_id

// Sum of recurring charges expected to fall within [fromISO, toISO], split by
// kind (minor units, in each rule's own currency). Used to fold not-yet-charged
// subscriptions into the dashboard's projected spend. Occurrences are stepped
// from each rule's next_run, so a charge that has already materialised (its
// next_run has advanced past the window) is naturally excluded — no double
// counting. Amounts are treated as base currency (rules carry no FX rate).
// A yearly expense counts only its monthly parts that fall in the window, as
// its charge will once it's made (shared/lib/spread.js).
export function expectedInWindow(rules, fromISO, toISO) {
  if (!fromISO || !toISO) return { expense: 0, income: 0 }
  let expense = 0
  let income = 0
  for (const r of rules) {
    if (!r.is_active) continue
    // ISO dates compare as strings; each step clamps like the materializer.
    let d = r.next_run
    let guard = 0
    while (d <= toISO && (!r.end_date || d <= r.end_date) && guard < 500) {
      const n = ruleSpreadMonths(r)
      if (n) {
        spreadDates(d, n).forEach((p, i) => {
          if (p >= fromISO && p <= toISO) expense += spreadPart(r.amount_minor, n, i)
        })
      } else if (d >= fromISO) {
        if (r.kind === 'income') income += r.amount_minor
        else expense += r.amount_minor
      }
      d = nextRunAfter(d, r.frequency, r.interval_n || 1)
      guard += 1
    }
  }
  return { expense, income }
}
