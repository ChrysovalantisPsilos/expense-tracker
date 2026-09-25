// Pure budget helpers (no I/O) — unit-tested in test/budgetMath.test.js.
import { toMinor } from '../../shared/lib/currency.js'
import { sumToBaseByKey } from '../../shared/lib/txnRollup.js'
import { isMonthPeriod } from '../transactions/periods.js'

// How close spend is to its cap, as the tone its progress bar takes (the
// theme's Progress variants): 'negative' once over the cap, 'warning' from 80%
// of it, otherwise undefined (the default brand fill). Minor units in.
export function budgetTone(spent, limit) {
  if (spent > limit) return 'negative'
  if (limit > 0 && spent >= limit * 0.8) return 'warning'
  return undefined
}

// Spend as a whole percent of the cap, for a budget row's label and bar
// ("78%"). Not clamped (the bar clamps itself); a zero cap reads 0% — the
// row's over-budget state comes from budgetTone, not from this number.
export function budgetPercent(spent, limit) {
  return limit > 0 ? Math.round((spent / limit) * 100) : 0
}

// What saving a budget amount field does, given the category's current cap
// (minor units, or null for none) and the field's text: { set: minor },
// { remove: true } (the field was cleared), or null (nothing to do — same
// amount, still no budget, or an unreadable value).
export function budgetChange(currentMinor, amount, currency) {
  const text = String(amount ?? '').trim()
  if (!text) return currentMinor == null ? null : { remove: true }
  const minor = toMinor(text, currency)
  if (!Number.isFinite(minor) || minor < 0) return null
  return minor === currentMinor ? null : { set: minor }
}

// ---- Rollover (the same rule as SQL budget_source_period / my_budgets) -----
// A month without budgets of its own uses the most recent earlier month's
// caps. my_budgets returns that month's rows, so their period_start says
// where they came from.

// The first day of the month before `periodStart` ('YYYY-MM-01').
export function previousPeriod(periodStart) {
  const [y, m] = periodStart.split('-').map(Number)
  return m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, '0')}-01`
}

// The month this month's caps were carried over from ('YYYY-MM-01'), or null
// when the month has its own budgets (or none at all).
export function carriedFrom(rows, periodStart) {
  if (!rows?.length) return null
  const src = rows[0].period_start
  return src && src < periodStart ? src : null
}

// "Carried over from August" (the year is added when it isn't this one's).
export function carriedLabel(source, periodStart, locale = undefined) {
  const [y, m] = source.split('-').map(Number)
  const month = new Date(Date.UTC(y, m - 1, 1)).toLocaleString(locale, {
    month: 'long', timeZone: 'UTC', ...(periodStart.slice(0, 4) !== source.slice(0, 4) ? { year: 'numeric' } : {}),
  })
  return `Carried over from ${month}`
}

// ---- A period's budgets (Home's Budgets card follows the period picker) ----
// Budgets are monthly, so a longer period adds its months up:
//   a month     that month's caps (carried over by the rollover rule when it
//               has none of its own) against that month's spend: the same
//               view as the Budgets page, for any month.
//   a year      per category, the sum of each month's cap against what was
//               spent in that category in those same months. A past year
//               counts its 12 months; the current year counts January up to
//               and including this month (this month's whole cap, as the
//               monthly view shows it). Future months never count.
//   all time    the same over every month from the first one with budgets
//               up to this month.
// A category counts only the months it had a cap in: spend in a month
// without its cap isn't set against anything. Months before the first
// budgets have no caps, so they drop out on their own.

const pad2 = (n) => String(n).padStart(2, '0')
const monthKey = (iso) => `${String(iso).slice(0, 7)}-01`

// The last day of a 'YYYY-MM-01' month ('YYYY-MM-DD').
const monthEnd = (month) => {
  const [y, m] = month.split('-').map(Number)
  return `${y}-${pad2(m)}-${pad2(new Date(Date.UTC(y, m, 0)).getUTCDate())}`
}

// The months a period's budgets cover, { first, last } as 'YYYY-MM-01'
// (first null for all time: from the first month with budgets), and the
// dates { from, to } its spend is read over (from null: from the start).
// `period` is a periods.js option.
export function budgetWindow(period, todayISO) {
  if (isMonthPeriod(period)) {
    const first = monthKey(period.from)
    return { first, last: first, from: first, to: monthEnd(first) }
  }
  const now = monthKey(todayISO)
  const first = period.from ? monthKey(period.from) : null
  const end = period.to ? monthKey(period.to) : now
  const last = end < now ? end : now
  return { first, last, from: first, to: monthEnd(last) }
}

// Every month from `first` to `last` ('YYYY-MM-01'), oldest first.
function monthsBetween(first, last) {
  const out = []
  let [y, m] = first.split('-').map(Number)
  for (let key = first; key <= last; key = `${y}-${pad2(m)}-01`) {
    out.push(key)
    m += 1
    if (m > 12) { m = 1; y += 1 }
  }
  return out
}

// The caps in force in `month`: the rows of the latest budget set at or
// before it (the rollover rule, ≡ SQL budget_source_period). `sets` are
// { period, rows }: a month with rows of its own, as my_budgets returns them
// (a month whose caps were all deleted is a set with no rows).
export function capsInMonth(sets, month) {
  let src = null
  for (const s of sets) if (s.period <= month && (!src || s.period > src.period)) src = s
  return src?.rows ?? []
}

// A period's budgets as the card's progress rows, and how many of its months
// had any cap:
//   sets    the budget sets behind the span's months (capsInMonth)
//   span    budgetWindow(period, today)
//   spend   spendRows() over the span, in any currency (converted to base)
// Each item: { id, categoryId, category, name, limit, spent, tone, months }:
// `limit` and `spent` add up the category's capped months, its look comes
// from its latest month. Most-used first (over-budget floats to the top).
export function periodBudgets({ sets, span, spend, baseCurrency }) {
  const first = span.first ?? sets.map((s) => s.period).sort()[0]
  if (!first || first > span.last) return { items: [], months: 0 }
  const spentIn = sumToBaseByKey(spend, baseCurrency,
    (r) => (r.category_id == null ? null : `${r.category_id}|${monthKey(r.spent_at)}`))
  const byCat = new Map()
  let months = 0
  for (const month of monthsBetween(first, span.last)) {
    const caps = capsInMonth(sets, month)
    if (caps.length) months += 1
    for (const b of caps) {
      const acc = byCat.get(b.category_id) ?? { limit: 0, spent: 0, months: 0 }
      acc.limit += Number(b.amount_minor) || 0
      acc.spent += spentIn.get(`${b.category_id}|${month}`) ?? 0
      acc.months += 1
      acc.category = b.categories ?? null
      byCat.set(b.category_id, acc)
    }
  }
  const items = [...byCat].map(([categoryId, a]) => ({
    id: categoryId,
    categoryId,
    category: a.category,
    name: a.category?.name ?? 'Category',
    limit: a.limit,
    spent: a.spent,
    tone: budgetTone(a.spent, a.limit),
    months: a.months,
  })).sort((a, b) => (b.spent / (b.limit || 1)) - (a.spent / (a.limit || 1)))
  return { items, months }
}

// The card's subtitle: a month's name ("This month", "March 2025") with
// where its caps were carried over from; a longer period with how many
// months it adds up ("2025 · 12 months").
export function budgetSubtitle(period, { months = 0, carried = null, periodStart } = {}) {
  if (!isMonthPeriod(period)) {
    return months ? `${period.label} · ${months} ${months === 1 ? 'month' : 'months'}` : period.label
  }
  if (!carried) return period.label
  const label = carriedLabel(carried, periodStart)
  return period.label === 'This month' ? label : `${period.label} · ${label}`
}

// The card's empty state, { text, canSet }: setting a budget is offered only
// for a period that includes this month (`current`), the month budgets are
// set for.
export function budgetsEmpty(period, current) {
  if (!current) return { text: `No budgets in ${period.label}.`, canSet: false }
  const when = period.label === 'This year' ? 'this year' : 'yet'
  return { text: `No budgets ${when}. Set monthly caps per category to track them here.`, canSet: true }
}
