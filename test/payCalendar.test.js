// Pay months (supabase/functions/_shared/payCalendar.ts, re-exported by
// src/shared/lib/payCalendar.js). The case table below is the one DB test 121
// checks against the SQL twin (pay_month_windows / pay_month_of, 0111): keep
// the two in lockstep.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  salaryShiftOf, opensMonth, payCalendar, payMonthStart, hasStarted, payMonthWindow, payMonthOf,
  expectedPayday, expectedEnd, partDate, addMonths,
} from '../supabase/functions/_shared/payCalendar.ts'
import {
  SALARY_SHIFT_DAYS, SALARY_SHIFT_DEFAULT_DAY, defaultSalaryCategoryId, salaryShiftPatch, salaryShiftView,
} from '../src/features/settings/spendingPrefs.js'
import { spendRows, spreadDates } from '../src/shared/lib/spread.js'
import { expectedInWindow } from '../src/features/recurring/recurringMath.js'
import { budgetWindow, periodBudgets, isRelativeLabel } from '../src/features/budgets/budgetMath.js'
import { periodFromValue, thisMonthPeriod, lastPayMonths } from '../src/shared/lib/periods.js'
import { buildTrend, spendingShares, foreignSpending } from '../src/features/insights/insightsMath.js'
import { potLine } from '../src/features/savings/savingsMath.js'
import { monthStartOf } from '../src/features/ai/aiMath.js'
import { buildStatement } from '../supabase/functions/generate-report/statementMath.ts'
import { statementSpan } from '../supabase/functions/generate-report/statementFile.ts'

const SHIFT = { fromDay: 25, categoryId: 'cat-salary' }
const cal = (days, today, shift = SHIFT) => payCalendar(shift, days, today)
const win = (label, c) => {
  const w = payMonthWindow(label, c)
  return [w.from, w.to, w.open]
}

test('salaryShiftOf: on only with a day 1–31 and a category', () => {
  assert.deepEqual(salaryShiftOf({ salary_shift_from_day: 25, salary_category_id: 'cat-salary' }), SHIFT)
  assert.equal(salaryShiftOf({ salary_shift_from_day: null, salary_category_id: 'cat-salary' }), null)
  assert.equal(salaryShiftOf({ salary_shift_from_day: 25, salary_category_id: null }), null)
  assert.equal(salaryShiftOf({ salary_shift_from_day: 0, salary_category_id: 'c' }), null)
  assert.equal(salaryShiftOf({ salary_shift_from_day: 32, salary_category_id: 'c' }), null)
  assert.equal(salaryShiftOf(null), null)
})

test('opensMonth: from D the next month starts on the payday; before D its own month on the 1st', () => {
  assert.deepEqual(opensMonth('2026-09-29', 25), { label: '2026-10', start: '2026-09-29' })
  assert.deepEqual(opensMonth('2026-09-25', 25), { label: '2026-10', start: '2026-09-25' })
  assert.deepEqual(opensMonth('2026-09-24', 25), { label: '2026-09', start: '2026-09-01' })
  assert.deepEqual(opensMonth('2026-11-03', 25), { label: '2026-11', start: '2026-11-01' })
  // D clamped to the month's length: 31 means the 28th in February, the 30th in April.
  assert.deepEqual(opensMonth('2026-02-28', 31), { label: '2026-03', start: '2026-02-28' })
  assert.deepEqual(opensMonth('2026-04-30', 31), { label: '2026-05', start: '2026-04-30' })
  assert.deepEqual(opensMonth('2026-04-29', 31), { label: '2026-04', start: '2026-04-01' })
  assert.deepEqual(opensMonth('2026-12-30', 25), { label: '2027-01', start: '2026-12-30' })
  // D = 1: every payday opens the next month.
  assert.deepEqual(opensMonth('2026-09-01', 1), { label: '2026-10', start: '2026-09-01' })
})

// The case table (DB test 121 checks the same cases in SQL).
test('case: payday 29 Sep, today 3 Oct: October 29 Sep → 31 Oct open, September ends 28 Sep', () => {
  const c = cal(['2026-08-28', '2026-09-29'], '2026-10-03')
  assert.deepEqual(c, {
    fromDay: 25, today: '2026-10-03', first: '2026-09', starts: { '2026-09': '2026-08-28', '2026-10': '2026-09-29' },
  })
  assert.deepEqual(win('2026-10', c), ['2026-09-29', '2026-10-31', true])
  assert.deepEqual(win('2026-09', c), ['2026-08-28', '2026-09-28', false])
  assert.equal(payMonthOf('2026-09-28', c), '2026-09')
  assert.equal(payMonthOf('2026-09-29', c), '2026-10')
  assert.equal(payMonthOf('2026-09-30', c), '2026-10')
  assert.equal(payMonthOf('2026-10-31', c), '2026-10')
})

test('case: November salary on 28 Oct closes October on 27 Oct', () => {
  const c = cal(['2026-08-28', '2026-09-29', '2026-10-28'], '2026-11-03')
  assert.deepEqual(win('2026-10', c), ['2026-09-29', '2026-10-27', false])
  assert.deepEqual(win('2026-11', c), ['2026-10-28', '2026-11-30', true])
  assert.equal(payMonthOf('2026-10-28', c), '2026-11')
})

test('case: an early November salary (3 Nov, before D) starts November on the 1st', () => {
  const c = cal(['2026-08-28', '2026-09-29', '2026-11-03'], '2026-11-10')
  assert.deepEqual(win('2026-10', c), ['2026-09-29', '2026-10-31', false])
  assert.deepEqual(win('2026-11', c), ['2026-11-01', '2026-11-30', true])
  assert.equal(c.starts['2026-11'], '2026-11-01')
})

test('case: a missing salary: provisional on the 1st until D, then the fallback re-cut', () => {
  const before = cal(['2026-08-28', '2026-09-29'], '2026-11-10')
  assert.equal(before.starts['2026-11'], undefined)
  assert.deepEqual(win('2026-10', before), ['2026-09-29', '2026-10-31', false])
  assert.deepEqual(win('2026-11', before), ['2026-11-01', '2026-11-30', true])
  const after = cal(['2026-08-28', '2026-09-29'], '2026-11-25')
  assert.equal(after.starts['2026-11'], '2026-10-25')
  assert.deepEqual(win('2026-10', after), ['2026-09-29', '2026-10-24', false])
  assert.deepEqual(win('2026-11', after), ['2026-10-25', '2026-11-30', true])
  // Certainly missing by a later payday too (one dated on or after D(M)).
  const later = cal(['2026-08-28', '2026-10-28'], '2026-10-02')
  assert.equal(later.starts['2026-10'], '2026-09-25')
  assert.deepEqual(win('2026-09', later), ['2026-08-28', '2026-09-24', false])
  assert.deepEqual(win('2026-10', later), ['2026-09-25', '2026-10-27', false])
})

test('case: the floor: months before the first payday stay calendar months', () => {
  const c = cal(['2026-08-28'], '2026-09-10')
  assert.equal(c.first, '2026-09')
  assert.deepEqual(win('2026-07', c), ['2026-07-01', '2026-07-31', false])
  assert.deepEqual(win('2026-08', c), ['2026-08-01', '2026-08-27', false])
  assert.deepEqual(win('2026-09', c), ['2026-08-28', '2026-09-30', true])
  assert.equal(payMonthOf('2026-05-30', c), '2026-05')
  // No paydays at all: no floor to start from, every month a calendar one.
  const none = cal([], '2026-09-10')
  assert.deepEqual(none, { fromDay: 25, today: '2026-09-10', first: null, starts: {} })
  assert.deepEqual(win('2026-09', none), ['2026-09-01', '2026-09-30', true])
})

test('case: Dec → Jan: a 30 Dec payday opens January of the next year', () => {
  const c = cal(['2026-11-27', '2026-12-30'], '2027-01-05')
  assert.deepEqual(win('2027-01', c), ['2026-12-30', '2027-01-31', true])
  assert.deepEqual(win('2026-12', c), ['2026-11-27', '2026-12-29', false])
  assert.equal(payMonthOf('2026-12-30', c), '2027-01')
  assert.equal(payMonthOf('2026-12-29', c), '2026-12')
})

test('case: D = 31 in February and April', () => {
  const shift = { fromDay: 31, categoryId: 'c' }
  const c = cal(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-29'], '2026-05-10', shift)
  assert.deepEqual(win('2026-03', c), ['2026-02-28', '2026-03-30', false])
  assert.equal(c.starts['2026-04'], '2026-03-31')
  // 29 Apr is before D(April) = 30: it opens April itself, which already started.
  assert.deepEqual(win('2026-04', c), ['2026-03-31', '2026-04-30', false])
  // May: no payday opens it, today < D(May) = 31 → provisional on the 1st.
  assert.deepEqual(win('2026-05', c), ['2026-05-01', '2026-05-31', true])
})

test('case: the setting off: no calendar, calendar months', () => {
  assert.equal(payCalendar(null, ['2026-09-29'], '2026-10-03'), null)
  assert.deepEqual(win('2026-02', null).slice(0, 2), ['2026-02-01', '2026-02-28'])
  assert.equal(payMonthOf('2026-09-29', null), '2026-09')
  assert.equal(payMonthStart('2026-10', null), '2026-10-01')
  assert.deepEqual(payMonthWindow('2026-10', null, '2026-10-03'),
    { label: '2026-10', from: '2026-10-01', to: '2026-10-31', open: true })
  assert.equal(payMonthWindow('2026-09', null, '2026-10-03').open, false)
})

test('the earliest of two paydays opening one month starts it', () => {
  const c = cal(['2026-09-26', '2026-09-29', '2026-10-01'], '2026-10-03')
  assert.equal(c.starts['2026-10'], '2026-09-26')
})

test('D = 1: the guard keeps every window non-empty', () => {
  const c = cal(['2026-09-01'], '2026-09-10', { fromDay: 1, categoryId: 'c' })
  assert.equal(c.starts['2026-10'], '2026-09-02')
  assert.deepEqual(win('2026-09', c), ['2026-09-01', '2026-09-01', false])
})

test('hasStarted: a real or fallback start, or today on or after the 1st', () => {
  const c = cal(['2026-08-28', '2026-09-29'], '2026-10-03')
  assert.equal(hasStarted('2026-10', c), true)
  assert.equal(hasStarted('2026-11', c), false)
  assert.equal(hasStarted('2026-11', { ...c, today: '2026-11-01' }), true)
})

test('windows are contiguous and never empty over 24 random months', () => {
  let seed = 7
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n }
  for (let run = 0; run < 40; run++) {
    const fromDay = 15 + rnd(17)
    const days = []
    for (let i = 0; i < 24; i++) {
      const label = addMonths('2025-01', i)
      if (rnd(6) === 0) continue // a missing salary
      const day = 1 + rnd(28)
      days.push(`${label}-${String(day).padStart(2, '0')}`)
    }
    const c = cal(days, '2026-12-14', { fromDay, categoryId: 'c' })
    for (let i = 0; i < 26; i++) {
      const a = payMonthWindow(addMonths('2024-12', i), c)
      const b = payMonthWindow(addMonths('2024-12', i + 1), c)
      assert.ok(a.from <= a.to, JSON.stringify({ a, days, fromDay }))
      const next = new Date(`${a.to}T00:00:00Z`)
      next.setUTCDate(next.getUTCDate() + 1)
      assert.equal(next.toISOString().slice(0, 10), b.from)
      assert.equal(payMonthOf(a.from, c), a.label)
      assert.equal(payMonthOf(a.to, c), a.label)
    }
  }
})

test('expectedPayday / expectedEnd: the rule, the last payday, a late salary', () => {
  const c = cal(['2026-08-28', '2026-09-29'], '2026-10-03')
  const oct = payMonthWindow('2026-10', c)
  assert.equal(expectedPayday('2026-10', c, { ruleNextRun: '2026-10-29' }), '2026-10-29')
  assert.equal(expectedEnd(oct, c, { ruleNextRun: '2026-10-29' }), '2026-10-28')
  // A rule charge that opens October itself (before D) says nothing about November.
  assert.equal(expectedPayday('2026-10', c, { ruleNextRun: '2026-10-15', lastPayDay: '2026-09-29' }), '2026-10-29')
  assert.equal(expectedPayday('2026-10', c, { lastPayDay: '2026-09-29' }), '2026-10-29')
  assert.equal(expectedPayday('2026-10', c, { lastPayDay: '2026-09-03' }), '2026-10-25')
  assert.equal(expectedPayday('2026-10', c, {}), '2026-10-25')
  // Late: the expected day has passed.
  const late = { ...c, today: '2026-10-30' }
  assert.equal(expectedPayday('2026-10', late, { lastPayDay: '2026-09-29' }), null)
  assert.equal(expectedEnd(oct, late, { lastPayDay: '2026-09-29' }), '2026-10-31')
  // A closed month or no calendar: the window's own end.
  assert.equal(expectedEnd({ ...oct, open: false, to: '2026-10-27' }, c, { ruleNextRun: '2026-10-29' }), '2026-10-27')
  assert.equal(expectedEnd(payMonthWindow('2026-10', null, '2026-10-03'), null, { ruleNextRun: '2026-10-29' }),
    '2026-10-31')
})

test('partDate: parts by pay month, capped at the window, never two in one pay month', () => {
  const c = cal(['2026-08-28', '2026-09-29'], '2026-10-03')
  const parts = Array.from({ length: 12 }, (_, i) => partDate('2026-09-30', i, c))
  assert.deepEqual(parts.map((p) => p.label), Array.from({ length: 12 }, (_, i) => addMonths('2026-10', i)))
  assert.deepEqual(parts.slice(0, 3).map((p) => p.date), ['2026-09-30', '2026-11-30', '2026-12-30'])
  assert.equal(new Set(parts.map((p) => payMonthOf(p.date, c))).size, 12)
  for (const p of parts) assert.equal(payMonthOf(p.date, c), p.label)
  // Capped at the window's end: October closes 27 Oct, so a 30th part is the 27th.
  const closed = cal(['2026-08-28', '2026-09-29', '2026-10-28'], '2026-11-03')
  assert.deepEqual(partDate('2026-08-30', 1, closed), { label: '2026-10', date: '2026-10-27' })
  // Without a calendar: the payment's day in each following month (spreadDates).
  assert.deepEqual([0, 1, 2].map((i) => partDate('2026-01-31', i, null)),
    [{ label: '2026-01', date: '2026-01-31' }, { label: '2026-02', date: '2026-02-28' },
      { label: '2026-03', date: '2026-03-31' }])
})

// ---- Where pay months reach (settings, spread, the projection, budgets,
// insights, savings, the month summary's month, the statement) ----------------
const OCT_CAL = cal(['2026-08-28', '2026-09-29'], '2026-10-03')
const NOW_OCT = new Date(2026, 9, 3)
const row = (id, spent_at, amount_minor, extra = {}) => ({
  id, kind: 'expense', spent_at, amount_minor, currency: 'EUR', exchange_rate: 1, category_id: 'food',
  categories: { name: 'Food' }, ...extra,
})

test('settings: the from-day picker offers the 15th to the 31st; an older day keeps working', () => {
  assert.equal(SALARY_SHIFT_DEFAULT_DAY, 25)
  assert.deepEqual([SALARY_SHIFT_DAYS[0], SALARY_SHIFT_DAYS.at(-1), SALARY_SHIFT_DAYS.length], [15, 31, 17])
  const cats = [
    { id: 'b', name: 'Bonus', kind: 'income' }, { id: 's', name: 'Salary', kind: 'income' },
    { id: 'x', name: 'Rent', kind: 'expense' },
  ]
  assert.equal(defaultSalaryCategoryId(cats), 's')
  assert.deepEqual(salaryShiftPatch(true, { fromDay: null, categoryId: null, categories: cats }),
    { salary_shift_from_day: 25, salary_category_id: 's' })
  assert.deepEqual(salaryShiftPatch(false, { fromDay: 25, categoryId: 's', categories: cats }), { salary_shift_from_day: null })
  assert.deepEqual(salaryShiftView({ fromDay: 25, incomeCount: 1 }).days, SALARY_SHIFT_DAYS)
  assert.deepEqual(salaryShiftView({ fromDay: 10, incomeCount: 1 }).days, [10, ...SALARY_SHIFT_DAYS])
  assert.equal(salaryShiftView({ fromDay: null, incomeCount: 0 }).disabled, true)
  assert.equal(salaryShiftView({ fromDay: 29, incomeCount: 1 }).shortMonths, true)
  // A day stored below 15 still cuts months.
  assert.deepEqual(opensMonth('2026-09-12', 10), { label: '2026-10', start: '2026-09-12' })
})

test('spread: a yearly payment\'s parts land one per pay month; the list and total share one window', () => {
  const yearly = row('y', '2026-09-30', 12000, { spread_months: 12 })
  assert.deepEqual(spreadDates('2026-09-30', 3, OCT_CAL), ['2026-09-30', '2026-11-30', '2026-12-30'])
  assert.deepEqual(spreadDates('2026-01-31', 3), ['2026-01-31', '2026-02-28', '2026-03-31'])
  const oct = payMonthWindow('2026-10', OCT_CAL)
  const parts = spendRows([yearly, row('a', '2026-09-30', 500)], 'EUR', oct.from, oct.to, { cal: OCT_CAL })
  assert.deepEqual(parts.map((r) => [r.id, r.amount_minor, r.spent_at]), [['y', 1000, '2026-09-30'], ['a', 500, '2026-09-30']])
  // Without a calendar the same payment is September's.
  assert.equal(spendRows([yearly], 'EUR', '2026-10-01', '2026-10-31').at(0).spent_at, '2026-10-30')
})

test('expectedInWindow: a yearly charge\'s parts by pay month; other charges on their own date', () => {
  const rules = [
    { is_active: true, kind: 'expense', frequency: 'yearly', interval_n: 1, next_run: '2026-10-30', amount_minor: 12000 },
    { is_active: true, kind: 'expense', frequency: 'monthly', interval_n: 1, next_run: '2026-10-05', amount_minor: 900 },
  ]
  assert.deepEqual(expectedInWindow(rules, '2026-10-03', '2026-10-31', false, OCT_CAL), { expense: 1900, income: 0 })
  assert.deepEqual(expectedInWindow(rules, '2026-10-03', '2026-10-28', false, OCT_CAL), { expense: 900, income: 0 })
})

test('budgets: October is keyed 2026-10-01 though its window starts 29 Sep; spend by pay month', () => {
  const oct = thisMonthPeriod(NOW_OCT, OCT_CAL)
  const span = budgetWindow(oct, '2026-10-03', OCT_CAL)
  assert.deepEqual(span, { first: '2026-10-01', last: '2026-10-01', from: '2026-09-29', to: '2026-10-31' })
  const sets = [{ period: '2026-10-01', rows: [{ category_id: 'food', amount_minor: 10000, categories: { name: 'Food' } }] }]
  const spend = spendRows([row('a', '2026-09-30', 3000), row('b', '2026-10-02', 2000), row('c', '2026-09-28', 9999)],
    'EUR', span.from, span.to, { cal: OCT_CAL })
  const { items } = periodBudgets({ sets, span, spend, baseCurrency: 'EUR', cal: OCT_CAL })
  assert.equal(items[0].spent, 5000)
  // A year: January to December labels, from January's window to December's.
  const year = budgetWindow(periodFromValue('y:2026', NOW_OCT, OCT_CAL), '2026-10-03', OCT_CAL)
  assert.deepEqual([year.first, year.last, year.to], ['2026-01-01', '2026-10-01', '2026-10-31'])
  assert.equal(isRelativeLabel(oct), true) // "This month"
  assert.equal(isRelativeLabel(periodFromValue('m:2026-9', NOW_OCT, OCT_CAL)), false)
})

test('insights: rows and months by pay month', () => {
  const months = lastPayMonths(2, NOW_OCT, OCT_CAL)
  assert.deepEqual(months.map((m) => [m.key, m.from, m.to]), [['2026-09', '2026-08-28', '2026-09-28'], ['2026-10', '2026-09-29', '2026-10-31']])
  const rows = [row('a', '2026-09-30', 3000), row('b', '2026-09-28', 1000),
    row('p', '2026-09-29', 250000, { kind: 'income', category_id: 'pay' }),
    row('f', '2026-09-30', 1000, { currency: 'USD', exchange_rate: 0.9 })]
  const trend = buildTrend(rows, months, 'EUR', new Set(), [], OCT_CAL)
  assert.deepEqual(trend.map((m) => [m.label, m.income, m.expense]), [['Sep', 0, 10], ['Oct', 2500, 39]])
  assert.equal(spendingShares(rows, '2026-10', 'EUR', OCT_CAL).length, 1)
  assert.deepEqual(foreignSpending(rows, '2026-10', 'EUR', OCT_CAL).items.map((i) => i.id), ['f'])
  assert.equal(foreignSpending(rows, '2026-10', 'EUR').items.length, 0) // calendar: September's
})

test('savings: the pot\'s line runs over pay months', () => {
  const moves = [row('s', '2026-09-30', 5000, { kind: 'income', category_id: 'pot', savings_from_income: true })]
  const { line, month } = potLine(moves, new Set(['pot']), 'EUR', { minor: 5000, source: 'entries' }, NOW_OCT, OCT_CAL)
  assert.deepEqual(line.map((p) => p.label), ['Sep', 'Oct'])
  assert.equal(month.fromIncome, 5000)
})

test('the month summary asks for the pay month holding today', () => {
  assert.equal(monthStartOf('2026-09-30', OCT_CAL), '2026-10-01')
  assert.equal(monthStartOf('2026-09-28', OCT_CAL), '2026-09-01')
  assert.equal(monthStartOf('2026-09-30'), '2026-09-01')
})

test('statement: a month\'s heading names it and its span; totals over the literal window', () => {
  assert.equal(statementSpan({ from: '2026-09-29', to: '2026-10-31', month: '2026-10', base: 'EUR' }),
    'October 2026 · 2026-09-29 – 2026-10-31   ·   EUR')
  assert.equal(statementSpan({ from: '2026-09-01', to: '2026-09-30', month: null, base: 'EUR' }),
    '2026-09-01  →  2026-09-30   ·   EUR')
  const yearly = row('y', '2026-09-30', 12000, { spread_months: 12 })
  const stmt = buildStatement([yearly, row('a', '2026-10-02', 500)], 'EUR', { from: '2026-09-29', to: '2026-10-31', cal: OCT_CAL })
  assert.equal(stmt.totalSpent, 15)
  assert.equal(stmt.rows.length, 2)
})
