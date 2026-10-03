// Pay months: with the salary setting on, a month runs from the day its
// salary arrived to the day before the next one (pure, no I/O). One copy for
// the client and the edge functions: src/shared/lib/payCalendar.js
// re-exports this module, spread.ts places a yearly payment's parts with it,
// and generate-report and monthFacts import it, so the app's monthly figures,
// the statement and the month summary cut the same months.
//
// Every row keeps its real date; the month's WINDOW moves. A month keeps its
// calendar identity, its label 'YYYY-MM' (budgets are keyed `${label}-01`).
//
// The setting (profiles.salary_shift_from_day + salary_category_id, 0081):
// D is the from-day, clamped to the month's length. A payday is an income row
// in the salary category that passes the server's amount filter (pay_days,
// 0111: at least half the median salary, so a small refund in the category
// never opens a month); the client only ever sees the dates
// (my_pay_calendar).
//
//   opensMonth   a payday on or after D(M) opens M+1 from the payday (29 Sep
//                opens October from 29 Sep); one before D opens its own month
//                from the 1st (3 Nov opens November from 1 Nov).
//   start of M   worked out from the oldest month to the newest:
//                1. real: the earliest start a payday opens M with;
//                2. floor: before the first payday's month, the 1st of M
//                   (older history stays in calendar months);
//                3. certainly missing: no payday opens M, and today ≥ D(M) or
//                   a payday exists on or after D(M): D(M−1) in M−1;
//                4. not known yet: the 1st of M, provisionally.
//                A start is never earlier than the day after the previous
//                month's start, so no window is ever empty.
//   window of M  from start(M) to start(M+1) − 1, open while M+1 hasn't
//                started (no real or fallback start, and today before its
//                1st). An open month's `to` is always its label's last day.
//
// SQL twin: public.pay_month_windows / pay_month_of / current_pay_month
// (0111). Keep the two in lockstep: DB test 121 checks the same case table as
// test/payCalendar.test.js.

export interface Shift {
  fromDay: number // 1..31
  categoryId: string
}

// The calendar a user's months are cut by: D, the user's today, the first
// payday's label (the floor) and the starts that differ from the 1st (real
// and fallback ones only), label → 'YYYY-MM-DD'. Plain JSON.
export interface Cal {
  fromDay: number
  today: string
  first: string | null
  starts: Record<string, string>
}

export interface Window {
  label: string
  from: string
  to: string
  open: boolean
}

// The user's setting as the maths needs it, or null when it's off.
export function salaryShiftOf(
  profile: { salary_shift_from_day?: number | null; salary_category_id?: string | null } | null | undefined,
): Shift | null {
  const d = Number(profile?.salary_shift_from_day)
  const c = profile?.salary_category_id
  return Number.isInteger(d) && d >= 1 && d <= 31 && c ? { fromDay: d, categoryId: c } : null
}

const pad2 = (x: number) => String(x).padStart(2, '0')
const ISO = /^\d{4}-\d{2}-\d{2}$/

// A date's calendar month label.
const labelOf = (iso: string) => String(iso).slice(0, 7)

// `label` moved by `n` months ('2026-12' + 1 → '2027-01').
export function addMonths(label: string, n: number): string {
  const [y, m] = label.split('-').map(Number)
  const i = y * 12 + m - 1 + n
  return `${Math.floor(i / 12)}-${pad2((i % 12) + 1)}`
}

const daysIn = (label: string) => {
  const [y, m] = label.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

// Day `day` of a month, clamped to its length ('2026-02', 31 → '2026-02-28').
const dayIn = (label: string, day: number) => `${label}-${pad2(Math.min(day, daysIn(label)))}`

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`
}

// The device's local date (the edge functions run in UTC and always pass
// their own `today`).
function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

// The month a payday opens and the day that month starts on.
export function opensMonth(iso: string, fromDay: number): { label: string; start: string } {
  const label = labelOf(iso)
  return Number(iso.slice(8, 10)) >= Math.min(fromDay, daysIn(label))
    ? { label: addMonths(label, 1), start: iso }
    : { label, start: `${label}-01` }
}

// The user's calendar from their paydays (dates only) and their today, or
// null when the setting is off (every month is then a calendar month).
export function payCalendar(shift: Shift | null, payDays: string[] | null | undefined, today: string): Cal | null {
  if (!shift) return null
  const { fromDay } = shift
  const days = [...new Set((payDays ?? []).map(String).filter((d) => ISO.test(d)))].sort()
  const starts: Record<string, string> = {}
  if (!days.length) return { fromDay, today, first: null, starts }

  const real: Record<string, string> = {}
  for (const d of days) {
    const o = opensMonth(d, fromDay)
    if (!real[o.label] || o.start < real[o.label]) real[o.label] = o.start
  }
  const first = opensMonth(days[0], fromDay).label
  const lastPay = days[days.length - 1]
  const lastLabel = opensMonth(lastPay, fromDay).label
  const todayNext = addMonths(labelOf(today), 1)
  const end = lastLabel > todayNext ? lastLabel : todayNext

  let prev = `${addMonths(first, -1)}-01` // the floor month before the first
  for (let label = first; label <= end; label = addMonths(label, 1)) {
    let start: string | undefined = real[label]
    if (!start) {
      const dM = dayIn(label, fromDay)
      if (today >= dM || lastPay >= dM) start = dayIn(addMonths(label, -1), fromDay)
    }
    if (start) {
      const floor = addDays(prev, 1)
      if (start < floor) start = floor
      starts[label] = start
      prev = start
    } else {
      prev = `${label}-01`
    }
  }
  return { fromDay, today, first, starts }
}

// The day month `label` starts on.
export const payMonthStart = (label: string, cal: Cal | null | undefined): string =>
  cal?.starts?.[label] ?? `${label}-01`

// Whether month `label` has begun: it has a real or fallback start, or
// today is on or after its 1st.
export const hasStarted = (label: string, cal: Cal | null | undefined, today = cal?.today ?? localToday()): boolean =>
  !!cal?.starts?.[label] || today >= `${label}-01`

// Month `label` as { label, from, to, open }. Without a calendar it is the
// calendar month, open when it is today's month.
export function payMonthWindow(label: string, cal: Cal | null | undefined, today = cal?.today ?? localToday()): Window {
  const next = addMonths(label, 1)
  return {
    label,
    from: payMonthStart(label, cal),
    to: addDays(payMonthStart(next, cal), -1),
    open: cal ? !hasStarted(next, cal, today) : labelOf(today) === label,
  }
}

// The month a date counts in: its calendar month, or the next one once that
// has started (29 Sep after the 29 Sep payday is October).
export function payMonthOf(iso: string, cal: Cal | null | undefined): string {
  const c = labelOf(iso)
  const n = addMonths(c, 1)
  return String(iso).slice(0, 10) >= payMonthStart(n, cal) ? n : c
}

export interface PaydayHints {
  ruleNextRun?: string | null // the salary rule's next charge
  lastPayDay?: string | null // the newest payday
}

// The hints from a user's data: their salary rule's next charge (the
// soonest active income rule in the salary category) and their newest
// payday.
// deno-lint-ignore no-explicit-any
export function paydayHints(rules: any[] | null | undefined, shift: Shift | null, lastPayDay: string | null = null): PaydayHints {
  const next = (rules ?? [])
    .filter((r) => shift && r?.is_active && r.kind === 'income' && r.category_id === shift.categoryId
      && (!r.end_date || r.next_run <= r.end_date))
    .map((r) => String(r.next_run))
    .sort()[0] ?? null
  return { ruleNextRun: next, lastPayDay }
}

// When the payday that opens the month after `label` is expected: the salary
// rule's next charge when it is today or later and opens a later month; else
// the last payday's day of the month in `label` when that is on or after D;
// else D(label). null when that date has passed (the salary is late) or
// there is no calendar.
export function expectedPayday(label: string, cal: Cal | null | undefined, hints: PaydayHints = {}): string | null {
  if (!cal) return null
  const { ruleNextRun, lastPayDay } = hints
  if (ruleNextRun && ISO.test(ruleNextRun) && ruleNextRun >= cal.today
      && opensMonth(ruleNextRun, cal.fromDay).label > label) return ruleNextRun
  const dM = dayIn(label, cal.fromDay)
  const last = lastPayDay && ISO.test(lastPayDay) ? dayIn(label, Number(lastPayDay.slice(8, 10))) : null
  const at = last && last >= dM ? last : dM
  return at < cal.today ? null : at
}

// Where an open month's projection ends: the day before the expected payday,
// or the window's last day (a closed month, no calendar, a late salary).
export function expectedEnd(win: Window, cal: Cal | null | undefined, hints: PaydayHints = {}): string {
  if (!win.open || !cal) return win.to
  const p = expectedPayday(win.label, cal, hints)
  if (!p) return win.to
  const end = addDays(p, -1)
  return end >= win.from && end < win.to ? end : win.to
}

// Part `i` of a yearly payment spread over months (spread.ts): its pay month
// and its date. Part 0 is the payment itself; part i falls on the payment's
// day in calendar month `label` (clamped), capped at that month's last day,
// so no two parts ever share a pay month. Without a calendar this is the
// payment's day in each following calendar month (SQL spread_part_date).
export function partDate(spentAt: string, i: number, cal: Cal | null | undefined): { label: string; date: string } {
  const label0 = payMonthOf(spentAt, cal)
  if (i === 0) return { label: label0, date: spentAt }
  const label = addMonths(label0, i)
  const date = dayIn(label, Number(spentAt.slice(8, 10)))
  if (!cal) return { label, date }
  const { to } = payMonthWindow(label, cal)
  return { label, date: date > to ? to : date }
}
