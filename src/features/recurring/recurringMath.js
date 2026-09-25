// Pure recurring-rule math (no React/supabase imports — unit-testable).
import {
  monthlyMinor, monthlyShare, perYearMinor, ruleSpreadMonths, ruleCountsMonthly, spreadDates, spreadPart,
} from '../../shared/lib/spread.js'
import { toBaseMinor } from '../../shared/lib/currency.js'

// A rule's cost in monthly minor units (shared with the statement).
export { monthlyMinor }

// The stored frequencies (the recurrence_freq enum).
export const FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly']

// ---- Repeat choices ----------------------------------------------------------
// The frequencies a user picks from. "Quarterly" is not a stored frequency: it
// is a monthly rule every 3 months (no schema change), shown as its own choice
// and labelled "every quarter". It has no "every N" of its own — a monthly
// rule every 6 months is "Monthly, every 6".
export const REPEAT_CHOICES = [
  ['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly'], ['quarterly', 'Quarterly'], ['yearly', 'Yearly'],
]

const isQuarterly = (r) => r.frequency === 'monthly' && Number(r.interval_n) === 3

const every = (n) => Math.max(1, parseInt(n, 10) || 1)

// A choice + "every N" → the rule's stored { frequency, interval_n }.
export function choiceToRule(choice, n = 1) {
  return choice === 'quarterly'
    ? { frequency: 'monthly', interval_n: 3 }
    : { frequency: choice, interval_n: every(n) }
}

// The other way: a stored rule → { choice, n } for the form.
export function ruleToChoice(rule) {
  if (isQuarterly(rule)) return { choice: 'quarterly', n: 1 }
  return { choice: rule.frequency, n: every(rule.interval_n) }
}

// "every month", "every 2 weeks", "every quarter", "every day"…
export function frequencyLabel({ frequency, interval_n = 1 }) {
  if (isQuarterly({ frequency, interval_n })) return 'every quarter'
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

// A new recurring rule made from a transaction (the transaction page's Repeat
// section, see planRepeat): same kind, amount, currency, category, account and
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

// Sum of recurring charges expected to fall within [fromISO, toISO], split by
// kind (minor units, in each rule's own currency). Used to fold not-yet-charged
// subscriptions into the dashboard's projected spend. Occurrences are stepped
// from each rule's next_run, so a charge that has already materialised (its
// next_run has advanced past the window) is naturally excluded — no double
// counting. Amounts are treated as base currency (rules carry no FX rate).
// A yearly expense counts only its monthly parts that fall in the window, as
// its charge will once it's made (shared/lib/spread.js) — or nothing at all
// with `separateYearly` (the user keeps yearly subscriptions separate, 0068).
export function expectedInWindow(rules, fromISO, toISO, separateYearly = false) {
  if (!fromISO || !toISO) return { expense: 0, income: 0 }
  let expense = 0
  let income = 0
  for (const r of rules) {
    if (!r.is_active || !ruleCountsMonthly(r, separateYearly)) continue
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

// ---- The Repeat section's draft ----------------------------------------------
// The form state behind the Repeat fields (RepeatFields.jsx), shared by the
// transaction page and the recurring-entry form. Text fields stay strings so
// the inputs can be empty mid-edit.
//   rule      an existing rule to edit, or null for a new one
//   fromDate  a new rule made from a transaction: the entry's date. The next
//             charge then follows the chosen frequency from it (the entry is
//             the first occurrence) until the user picks a date themselves.
//   todayISO  a new rule's next charge otherwise
export function repeatDraft(rule, { fromDate, todayISO } = {}) {
  const { choice, n } = rule ? ruleToChoice(rule) : { choice: 'monthly', n: 1 }
  return {
    choice,
    n: String(n),
    nextRun: rule?.next_run ?? (fromDate ? nextRunAfter(fromDate, 'monthly', 1) : todayISO),
    follows: !rule && !!fromDate,
    endDate: rule?.end_date ?? '',
    remind: rule?.remind_days_before != null,
    remindDays: String(rule?.remind_days_before ?? 3),
    active: rule?.is_active ?? true,
  }
}

// Apply `changes` to a draft. While the next charge follows the entry's date
// (`follows`), a new frequency, interval or `fromDate` moves it; picking a
// date by hand stops that.
export function editRepeat(draft, changes, fromDate) {
  const d = { ...draft, ...changes }
  if ('nextRun' in changes) d.follows = false
  if (d.follows && fromDate) {
    const { frequency, interval_n } = choiceToRule(d.choice, d.n)
    d.nextRun = nextRunAfter(fromDate, frequency, interval_n)
  }
  return d
}

// A draft → the rule's schedule fields for save_recurring_rule.
// Reminders are 1–60 days before (3 when the field is left empty).
export function repeatRuleFields(d) {
  return {
    ...choiceToRule(d.choice, d.n),
    next_run: d.nextRun,
    end_date: d.endDate || null,
    remind_days_before: d.remind ? Math.min(60, Math.max(1, parseInt(d.remindDays, 10) || 3)) : null,
    is_active: d.active,
  }
}

// The fields an entry and its rule share: editing one of them on an entry
// that repeats changes the rule's future charges too.
const SHARED_FIELDS = ['kind', 'amount_minor', 'currency', 'category_id', 'description']
const pickShared = (o) => Object.fromEntries(SHARED_FIELDS.map((k) => [k, o?.[k] ?? null]))

// What saving the transaction page does to the entry's recurring rule, once
// the entry itself is saved:
//   { action: 'none' }
//   { action: 'create', fields }     Repeat switched on for an entry with no
//                                    rule (linked via `entry.id`, or
//                                    `entry.client_uuid` for a new entry)
//   { action: 'update', id, fields } the linked rule: only what changed — an
//                                    edited shared field of the entry, or the
//                                    schedule — so fixing an old charge's
//                                    note never rolls the rule back to that
//                                    charge's amount after a price change
//   { action: 'delete', id }         Repeat switched off on a linked entry
// `before` is the entry as loaded (null for a new one), `entry` as saved.
export function planRepeat({ rule, repeat, draft, before, entry }) {
  if (!rule) {
    return repeat
      ? { action: 'create', fields: { ...ruleFromTransaction(entry), ...repeatRuleFields(draft) } }
      : { action: 'none' }
  }
  if (!repeat) return { action: 'delete', id: rule.id }
  const was = { ...pickShared(before), ...repeatRuleFields(repeatDraft(rule)) }
  const now = { ...pickShared(entry), ...repeatRuleFields(draft) }
  const fields = Object.fromEntries(Object.entries(now).filter(([k, v]) => v !== was[k]))
  return Object.keys(fields).length ? { action: 'update', id: rule.id, fields } : { action: 'none' }
}

// ---- Subscriptions by frequency (Home card, Recurring page) ------------------
// Expense rules grouped by how often they charge. Other intervals fold into
// their base unit (every 2 months → Monthly, every 2 years → Yearly), a daily
// rule folds into Weekly, and a monthly rule every 3 months is Quarterly.
const SUBSCRIPTION_GROUPS = [
  { key: 'weekly', label: 'Weekly', unit: 'week' },
  { key: 'monthly', label: 'Monthly', unit: 'month' },
  { key: 'quarterly', label: 'Quarterly', unit: 'quarter' },
  { key: 'yearly', label: 'Yearly', unit: 'year' },
]

export function subscriptionGroup(rule) {
  if (rule.frequency === 'daily' || rule.frequency === 'weekly') return 'weekly'
  if (isQuarterly(rule)) return 'quarterly'
  return rule.frequency === 'yearly' ? 'yearly' : 'monthly'
}

// What a rule costs per period of its group, in minor units of its currency:
// every 2 weeks €20 → €10 a week, daily €1 → €7 a week, every 2 years €100 →
// €50 a year (perYearMinor, the statement's figure).
export function periodMinor(rule) {
  const n = every(rule.interval_n)
  const amount = Number(rule.amount_minor) || 0
  switch (subscriptionGroup(rule)) {
    case 'weekly': return Math.round((rule.frequency === 'daily' ? amount * 7 : amount) / n)
    case 'quarterly': return amount
    case 'yearly': return perYearMinor(rule)
    default: return Math.round(amount / n)
  }
}

// A rule that still has a charge to come: active and not past its end date.
const upcoming = (r) => r.is_active && (!r.end_date || r.next_run <= r.end_date)

// The groups the user has, in SUBSCRIPTION_GROUPS order, each with:
//   rules     every expense rule in the group, paused and ended ones included
//             (the Recurring page lists them to resume or edit), input order
//   total     Σ periodMinor of its upcoming rules: the cost per `unit`
//   perMonth  Σ monthlyMinor of them (the same per-rule rounding as the
//             statement's yearly section, so both agree)
//   next      the `limit` soonest upcoming rules
//   count     how many upcoming rules
//   foreign   some upcoming rule is in another currency than `baseCurrency`
//             (rules carry no exchange rate, so they're summed at face value)
// `upcomingOnly` leaves out groups with nothing to come (Home's card).
// Income isn't a subscription: only expense rules count.
export function subscriptionGroups(rules, baseCurrency, { limit = 3, upcomingOnly = false } = {}) {
  const out = []
  for (const g of SUBSCRIPTION_GROUPS) {
    const all = rules.filter((r) => r.kind !== 'income' && subscriptionGroup(r) === g.key)
    const live = all.filter(upcoming)
      .sort((a, b) => (a.next_run < b.next_run ? -1 : a.next_run > b.next_run ? 1 : 0))
    if (!all.length || (upcomingOnly && !live.length)) continue
    out.push({
      ...g,
      rules: all,
      total: live.reduce((s, r) => s + periodMinor(r), 0),
      perMonth: live.reduce((s, r) => s + monthlyMinor(r), 0),
      next: live.slice(0, limit),
      count: live.length,
      foreign: live.some((r) => r.currency !== baseCurrency),
    })
  }
  return out
}

// ---- What subscriptions charged in a period (Home card, other periods) ------
// Home's Subscriptions card shows today's rules only for the current month;
// any other period (a past month or year, this year, all time) shows what
// was actually charged in it: the expense rows linked to a recurring rule
// (transactions.recurring_rule_id, 0065 — the materializer's charges and the
// entry a rule was made from), grouped by the rule's frequency like
// subscriptionGroups. A row whose rule was deleted lost its link, so it's no
// longer a subscription charge. `rows` are the period's paid rows
// (spread.paidInWindow): a yearly charge counts once, on its real date.
// Each group, in SUBSCRIPTION_GROUPS order, only those with charges:
//   total    Σ the charges in `baseCurrency`, at each row's captured rate
//   charges  the rows, newest first
export function chargedGroups(rows, baseCurrency) {
  const charges = rows
    .filter((r) => r.kind === 'expense' && r.recurring_rule_id)
    .sort((a, b) => (a.spent_at < b.spent_at ? 1 : a.spent_at > b.spent_at ? -1 : 0))
  const out = []
  for (const g of SUBSCRIPTION_GROUPS) {
    const mine = charges.filter((r) => subscriptionGroup(r.recurring ?? { frequency: 'monthly' }) === g.key)
    if (!mine.length) continue
    out.push({
      ...g,
      total: mine.reduce((s, r) => s + toBaseMinor(r.amount_minor, r.exchange_rate, r.currency, baseCurrency), 0),
      charges: mine,
    })
  }
  return out
}

// The card's wording for a period's charges: { subtitle, empty }.
export function chargedWording(period) {
  if (period.value === 'all') return { subtitle: 'Charged so far', empty: 'No subscription charges yet.' }
  const when = period.label === 'This year' ? 'this year' : `in ${period.label}`
  return { subtitle: `Charged ${when}`, empty: `No subscription charges ${when}.` }
}

// What the active income rules bring in per month (the Recurring page's
// Income tab).
export const incomePerMonth = (rules) => rules
  .filter((r) => r.kind === 'income' && upcoming(r))
  .reduce((s, r) => s + monthlyMinor(r), 0)
