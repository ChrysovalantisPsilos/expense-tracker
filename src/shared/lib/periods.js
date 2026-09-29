import { isoDate, monthTitle } from './dates.js'
import { t } from './i18n/i18n.js'

// Period options (a month, a year, all time) as { value, label, from, to }.
// `value` is a stable token — 'm:2026-9', 'y:2026', 'all' — that pages keep
// in their state or URL. Pure module (no React/supabase) so it's unit-testable.
// Labels are made when a period is built, in the app's language.

function monthPeriod(y, m, d) {
  const start = new Date(y, m, 1)
  const end = new Date(y, m + 1, 0)
  const now = y === d.getFullYear() && m === d.getMonth()
  return {
    value: `m:${start.getFullYear()}-${start.getMonth() + 1}`,
    label: now ? t('transactions:periods.thisMonth') : monthTitle(start),
    from: isoDate(start), to: isoDate(end),
  }
}

const yearPeriod = (yr, d) => ({
  value: `y:${yr}`, label: yr === d.getFullYear() ? t('transactions:periods.thisYear') : String(yr),
  from: `${yr}-01-01`, to: `${yr}-12-31`,
})

const allTime = () => ({ value: 'all', label: t('transactions:periods.allTime'), from: null, to: null })

// "This month": every picker's default, always among buildPeriods' options.
export const thisMonthPeriod = (d = new Date()) => monthPeriod(d.getFullYear(), d.getMonth(), d)

// Whether a period is this month (not just labelled like it).
export const isThisMonth = (period, d = new Date()) => period?.value === thisMonthPeriod(d).value

// The 1st of next month ('YYYY-MM-DD'): where a month still ahead starts.
export const nextMonthStart = (d = new Date()) => isoDate(new Date(d.getFullYear(), d.getMonth() + 1, 1))

// Dashboard period options, clamped so the user never sees months/years from
// before they have any data. The range spans from `oldestISO` (their oldest
// transaction, YYYY-MM-DD) up to now — importing older data extends it for
// free. With no transactions, only "This month" is offered.
//
// `newestISO` (YYYY-MM-DD) is the latest date an entry COUNTS on (the salary
// setting re-dates a late-month salary to the 1st of the next month,
// salaryShift.countedDate). When it's past this month, next month is offered
// too, first in the list and labelled like any other month: the salary paid
// on the 28th already opens next month's budget month. Only next month —
// a later date is clamped to it — and no year option for it: in December,
// January stands on its own (a whole year holding one salary would add
// nothing), and in any other month "This year" already covers it. "This
// month" stays the default; callers pick it with thisMonthPeriod.
export function buildPeriods(oldestISO, d = new Date(), { newestISO } = {}) {
  const y = d.getFullYear()
  const m = d.getMonth()
  const nowMonthIdx = y * 12 + m
  const thisMonth = monthPeriod(y, m, d)
  // Read calendar dates straight from the strings: new Date('YYYY-MM-DD')
  // is UTC midnight, which is the previous day (and month) west of UTC.
  const monthIdx = (iso) => {
    const [yy, mm] = String(iso).split('-').map(Number)
    return yy * 12 + mm - 1
  }
  const ahead = newestISO && monthIdx(newestISO) > nowMonthIdx
    ? [monthPeriod(Math.floor((nowMonthIdx + 1) / 12), (nowMonthIdx + 1) % 12, d)]
    : []
  if (!oldestISO) return [...ahead, thisMonth]

  const oldestY = Number(String(oldestISO).split('-')[0])
  const oldestMonthIdx = monthIdx(oldestISO)

  const out = [...ahead]
  for (let idx = nowMonthIdx; idx >= oldestMonthIdx; idx--) {
    out.push(monthPeriod(Math.floor(idx / 12), idx % 12, d))
  }
  // Future-dated data can leave the months loop empty (oldest is after now):
  // "This month" must always exist — it's the default selection and callers
  // index into the list.
  if (!out.some((p) => p.value === thisMonth.value)) out.push(thisMonth)
  for (let yr = y; yr >= oldestY; yr--) out.push(yearPeriod(yr, d))
  // "All time" only adds value once there's data spanning more than this month.
  if (oldestMonthIdx < nowMonthIdx) out.push(allTime())
  return out
}

// The period a token names (as buildPeriods would label it), or null for
// anything malformed — a hand-edited URL falls back to the caller's default.
export function periodFromValue(value, d = new Date()) {
  const v = String(value ?? '')
  if (v === 'all') return allTime()
  const month = /^m:(\d{4})-(\d{1,2})$/.exec(v)
  if (month && +month[2] >= 1 && +month[2] <= 12) return monthPeriod(+month[1], +month[2] - 1, d)
  const year = /^y:(\d{4})$/.exec(v)
  if (year) return yearPeriod(+year[1], d)
  return null
}

// A period picker's options with `period` (e.g. from a link) always among
// them: a period outside the data range goes first rather than vanishing.
export function withPeriod(periods, period) {
  return periods.some((p) => p.value === period.value) ? periods : [period, ...periods]
}

// Whether a period is a single month (budgets are monthly).
export const isMonthPeriod = (period) => String(period?.value).startsWith('m:')

// Whether a period ended before today ('YYYY-MM-DD'): a past month or year.
// This month, this year, all time and next month (buildPeriods' newestISO)
// are not — they're the periods where what's coming still matters.
export const isPastPeriod = (period, todayISO) => !!period?.to && period.to < todayISO
