import { isoDate, lastMonths, monthRange, monthTitle, shortDate, shortMonth } from './dates.js'
import { t } from './i18n/i18n.js'
import { addMonths, payMonthOf, payMonthStart, payMonthWindow } from './payCalendar.js'

// Period options (a month, a year, all time) as { value, label, from, to }.
// `value` is a stable token — 'm:2026-9', 'y:2026', 'all' — that pages keep
// in their state or URL. Pure module (no React/supabase) so it's unit-testable.
// Labels are made when a period is built, in the app's language.
//
// `cal` (payCalendar.js, the last argument everywhere; null when the salary
// setting is off) cuts the months from payday to payday: a month keeps its
// calendar identity (`value`, `key`, "October 2026") while its window
// (`from`..`to`) moves. With `cal` null every period is a calendar one.

const pad2 = (n) => String(n).padStart(2, '0')
const labelOf = (y, m) => `${y}-${pad2(m + 1)}` // m 0-based
const todayOf = (d) => isoDate(d)

// The month `label` names ('YYYY-MM') as a period: { value, key, label,
// range, from, to, open }. `range` ("29 Sep – 27 Oct", or "from 29 Sep"
// while it's open) is set only when the window differs from the calendar
// month.
function monthPeriod(y, m, d, cal) {
  const key = labelOf(y, m)
  const today = todayOf(d)
  const start = new Date(y, m, 1)
  // With the setting off, the calendar month (dates.monthRange) as always.
  const w = cal ? payMonthWindow(key, cal, today) : { ...monthRange(start), open: key === today.slice(0, 7) }
  const calendar = w.from === `${key}-01` && w.to === isoDate(new Date(y, m + 1, 0))
  const period = {
    value: `m:${y}-${m + 1}`,
    key,
    label: key === payMonthOf(today, cal) ? t('transactions:periods.thisMonth') : monthTitle(start),
    from: w.from, to: w.to, open: w.open,
  }
  if (!calendar) {
    period.range = w.open
      ? t('transactions:periods.payFrom', { from: shortDate(w.from, d) })
      : t('transactions:periods.payRange', { from: shortDate(w.from, d), to: shortDate(w.to, d) })
  }
  return period
}

// The current pay month's year and month (0-based).
function nowMonth(d, cal) {
  const [y, m] = payMonthOf(todayOf(d), cal).split('-').map(Number)
  return { y, m: m - 1 }
}

const yearPeriod = (yr, d, cal) => ({
  value: `y:${yr}`, label: yr === nowMonth(d, cal).y ? t('transactions:periods.thisYear') : String(yr),
  from: payMonthStart(`${yr}-01`, cal), to: payMonthWindow(`${yr}-12`, cal, todayOf(d)).to,
})

const allTime = () => ({ value: 'all', label: t('transactions:periods.allTime'), from: null, to: null })

// "This month": the pay month holding `d` (29 Sep after a 29 Sep payday is
// October), every picker's default, always among buildPeriods' options.
export function thisMonthPeriod(d = new Date(), cal = null) {
  const { y, m } = nowMonth(d, cal)
  return monthPeriod(y, m, d, cal)
}

// Whether a period is this month (not just labelled like it).
export const isThisMonth = (period, d = new Date(), cal = null) =>
  period?.value === thisMonthPeriod(d, cal).value

// The budget key of a month period ('YYYY-MM-01', from its value), or null
// for a year or all time. Budgets are keyed by the month's label, never by
// `period.from` (which is the window's first day, e.g. 29 Sep for October).
export function periodMonth(period) {
  const m = /^m:(\d{4})-(\d{1,2})$/.exec(String(period?.value ?? ''))
  return m ? `${m[1]}-${pad2(+m[2])}-01` : null
}

// Dashboard period options, clamped so the user never sees months/years from
// before they have any data. The months run from the pay month of
// `oldestISO` (their oldest transaction, YYYY-MM-DD) to the current pay
// month — importing older data extends it for free. With no transactions,
// only "This month" is offered.
export function buildPeriods(oldestISO, d = new Date(), { cal = null } = {}) {
  const { y, m } = nowMonth(d, cal)
  const nowMonthIdx = y * 12 + m
  const thisMonth = monthPeriod(y, m, d, cal)
  if (!oldestISO) return [thisMonth]

  // Read calendar dates straight from the strings: new Date('YYYY-MM-DD')
  // is UTC midnight, which is the previous day (and month) west of UTC.
  const [oldestY, oldestM] = payMonthOf(String(oldestISO).slice(0, 10), cal).split('-').map(Number)
  const oldestMonthIdx = oldestY * 12 + oldestM - 1

  const out = []
  for (let idx = nowMonthIdx; idx >= oldestMonthIdx; idx--) {
    out.push(monthPeriod(Math.floor(idx / 12), idx % 12, d, cal))
  }
  // Future-dated data can leave the months loop empty (oldest is after now):
  // "This month" must always exist — it's the default selection and callers
  // index into the list.
  if (!out.some((p) => p.value === thisMonth.value)) out.push(thisMonth)
  for (let yr = y; yr >= oldestY; yr--) out.push(yearPeriod(yr, d, cal))
  // "All time" only adds value once there's data spanning more than this month.
  if (oldestMonthIdx < nowMonthIdx) out.push(allTime())
  return out
}

// The period a token names (as buildPeriods would label it), or null for
// anything malformed — a hand-edited URL falls back to the caller's default.
export function periodFromValue(value, d = new Date(), cal = null) {
  const v = String(value ?? '')
  if (v === 'all') return allTime()
  const month = /^m:(\d{4})-(\d{1,2})$/.exec(v)
  if (month && +month[2] >= 1 && +month[2] <= 12) return monthPeriod(+month[1], +month[2] - 1, d, cal)
  const year = /^y:(\d{4})$/.exec(v)
  if (year) return yearPeriod(+year[1], d, cal)
  return null
}

// The last `n` pay months, oldest → newest, each as { key: 'YYYY-MM',
// label: 'Oct', from, to, open } — the current one last. Without a calendar
// these are the calendar months (dates.lastMonths).
export function lastPayMonths(n, d = new Date(), cal = null) {
  if (!cal) return lastMonths(n, d)
  const now = payMonthOf(todayOf(d), cal)
  const out = []
  for (let i = n - 1; i >= 0; i--) {
    const key = addMonths(now, -i)
    const w = payMonthWindow(key, cal, todayOf(d))
    out.push({ key, label: shortMonth(Number(key.slice(5, 7)) - 1), from: w.from, to: w.to, open: w.open })
  }
  return out
}

// A month's name with its pay window when that differs from the calendar
// month: "This month · from 29 Sep", "October 2026 · 29 Sep – 27 Oct".
export const periodWithRange = (period) => (period?.range ? `${period.label} · ${period.range}` : period?.label)

// A period picker's options with `period` (e.g. from a link) always among
// them: a period outside the data range goes first rather than vanishing.
export function withPeriod(periods, period) {
  return periods.some((p) => p.value === period.value) ? periods : [period, ...periods]
}

// Whether a period is a single month (budgets are monthly).
export const isMonthPeriod = (period) => String(period?.value).startsWith('m:')

// Whether a period ended before today ('YYYY-MM-DD'): a past month or year.
// This month, this year and all time are not — they're the periods where
// what's coming still matters (an open month's `to` is its label's last day).
export const isPastPeriod = (period, todayISO) => !!period?.to && period.to < todayISO
