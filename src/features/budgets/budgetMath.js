// Pure budget helpers (no I/O) — unit-tested in test/budgetMath.test.js.
import { toMinor } from '../../shared/lib/currency.js'
import { sumToBaseByKey } from '../../shared/lib/txnRollup.js'
import { intlLocale, t } from '../../shared/lib/i18n/i18n.js'
import { monthAlone, monthTitle } from '../../shared/lib/dates.js'
import { isMonthPeriod, isPastPeriod, periodMonth } from '../../shared/lib/periods.js'
import { payMonthOf, payMonthWindow } from '../../shared/lib/payCalendar.js'
import { categoryDisplayName } from '../../shared/lib/categoryName.js'
import { categoryLook } from '../../shared/lib/categoryStyle.js'
import { formatMoney } from '../../shared/lib/currency.js'

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

// One month's my_budgets answer as budget sets (capsInMonth): the month the
// rows carry (their period_start, which names an earlier month when its caps
// rolled over), or none.
export const monthSets = (rows) => (rows?.length ? [{ period: rows[0].period_start, rows }] : [])

// Whether the Budgets page offers "Copy last month's budgets": once this
// month has its own caps (or none) and last month had some (`previousCount`);
// a month still showing last month's is already using them.
export const canCopyBudgets = (carried, previousCount) => !carried && previousCount > 0

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
// The month is its in-a-date form, which Greek needs here («Ίδια όρια με του
// Αυγούστου»): the month-and-year format would give the nominative.
export function carriedLabel(source, periodStart, locale = intlLocale()) {
  const [y, m] = source.split('-').map(Number)
  const name = monthAlone(m, locale)
  const month = periodStart.slice(0, 4) !== source.slice(0, 4) ? `${name} ${y}` : name
  return t('budgets:carriedFrom', { month })
}

// Whether a period's label names it from today ("This month", "This year")
// rather than by its date: periods.js labels every other month with
// monthTitle and every other year with its number. Works in any language.
export function isRelativeLabel(period) {
  const month = periodMonth(period)
  const year = /^y:(\d{4})$/.exec(String(period?.value ?? ''))?.[1]
  if (!month && !year) return false
  const [y, m] = (month ?? `${year}-01`).split('-').map(Number)
  const plain = month ? monthTitle(new Date(y, m - 1, 1)) : String(y)
  return period.label !== plain
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

// The month (pay month with `cal`) a date counts in, as its budget key.
const monthKey = (iso, cal) => `${payMonthOf(String(iso).slice(0, 10), cal)}-01`

// The months a period's budgets cover, { first, last } as 'YYYY-MM-01'
// labels (first null for all time: from the first month with budgets), and
// the dates { from, to } its spend is read over (from null: from the start):
// the months' windows, pay months with `cal` (payCalendar.js). `period` is a
// periods.js option: a month is keyed by its label (periodMonth), a year by
// its January to December.
export function budgetWindow(period, todayISO, cal = null) {
  if (isMonthPeriod(period)) {
    const first = periodMonth(period)
    return { first, last: first, from: period.from, to: period.to }
  }
  const now = monthKey(todayISO, cal)
  const year = /^y:(\d{4})$/.exec(String(period?.value ?? ''))?.[1]
  const first = year ? `${year}-01-01` : null
  const end = year ? `${year}-12-01` : now
  const last = end < now ? end : now
  return { first, last, from: period.from ?? null, to: payMonthWindow(last.slice(0, 7), cal, todayISO).to }
}

// The months whose caps a longer span reads (useBudgetSets): of every month
// with budgets (`periods`, sorted), those up to `last`, from the latest one at
// or before `first` (whose caps `first` carries; first null: from the start).
export function setPeriods(periods, first, last) {
  const upTo = periods.filter((p) => p <= last)
  const from = first ? Math.max(0, upTo.findLastIndex((p) => p <= first)) : 0
  return upTo.slice(from)
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
//   span    budgetWindow(period, today, cal)
//   spend   spendRows() over the span, in any currency (converted to base),
//           each row in the month it counts in (its pay month with `cal`)
// Each item: { id, categoryId, category, name, limit, spent, tone, months }:
// `limit` and `spent` add up the category's capped months, its look comes
// from its latest month. Most-used first (over-budget floats to the top).
export function periodBudgets({ sets, span, spend, baseCurrency, cal = null }) {
  const first = span.first ?? sets.map((s) => s.period).sort()[0]
  if (!first || first > span.last) return { items: [], months: 0 }
  const spentIn = sumToBaseByKey(spend, baseCurrency,
    (r) => (r.category_id == null ? null : `${r.category_id}|${monthKey(r.spent_at, cal)}`))
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
    name: categoryDisplayName(a.category) || t('budgets:fallbackName'),
    limit: a.limit,
    spent: a.spent,
    tone: budgetTone(a.spent, a.limit),
    months: a.months,
  })).sort((a, b) => (b.spent / (b.limit || 1)) - (a.spent / (a.limit || 1)))
  return { items, months }
}

// The Budgets page's heading for the month its caps are set for
// ('YYYY-MM-01', budgetWindow's `last`): "October 2026", also on 30 Sep
// after the payday that opened October.
export function budgetHeading(month) {
  const [y, m] = String(month).split('-').map(Number)
  return monthTitle(new Date(y, m - 1, 1))
}

// The card's subtitle: a month's name ("This month", "March 2025") with
// where its caps were carried over from; a longer period with how many
// months it adds up ("2025 · 12 months").
export function budgetSubtitle(period, { months = 0, carried = null, periodStart } = {}) {
  if (!isMonthPeriod(period)) {
    return months ? t('budgets:card.months', { period: period.label, count: months }) : period.label
  }
  if (!carried) return period.label
  const label = carriedLabel(carried, periodStart)
  return isRelativeLabel(period) ? label : t('budgets:card.carried', { period: period.label, carried: label })
}

// The card's empty state, { text, canSet }: setting a budget is offered only
// for a period that hasn't ended (`current`): one that includes this month,
// the month budgets are set for, or next month, which this month's caps
// carry over into.
export function budgetsEmpty(period, current) {
  if (!current) return { text: t('budgets:card.emptyPast', { period: period.label }), canSet: false }
  const thisYear = !isMonthPeriod(period) && isRelativeLabel(period)
  return { text: t(thisYear ? 'budgets:card.emptyThisYear' : 'budgets:card.emptyYet'), canSet: true }
}

// A budget row as BudgetRow shows it (the web's, and the native app's):
// the category's name and badge, "€312.40 of €400.00", the percent (its
// label and the bar's length), the bar's tone and whether it's over (an
// "Over budget" pill, the percent in red). `item` is one of periodBudgets'.
export function budgetRowParts(item, currency) {
  const percent = budgetPercent(item.spent, item.limit)
  const over = item.tone === 'negative'
  return {
    id: item.id,
    categoryId: item.categoryId,
    name: item.name,
    look: categoryLook(item.category),
    meta: t('budgets:progress', { spent: formatMoney(item.spent, currency), limit: formatMoney(item.limit, currency) }),
    percent,
    valueLabel: `${percent}%`,
    tone: item.tone ?? null,
    over,
    overLabel: over ? t('common:budget.over') : null,
  }
}

// A past month whose every budget held (none over its cap), as the native
// app's Home says it: { title, note }; null for this month (or a later
// one), a period that isn't a month, a month without budgets, or one with a
// budget over. `items` are budgetRowParts' rows.
export function heldNote(items, period, todayISO) {
  if (!isMonthPeriod(period) || !isPastPeriod(period, todayISO) || !items?.length) return null
  if (items.some((item) => item.over)) return null
  return {
    title: t('budgets:held.title', { period: period.label }),
    note: t('budgets:held.note', { count: items.length }),
  }
}
