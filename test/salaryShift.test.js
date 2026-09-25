// "Salary paid late in the month counts toward the next month" (0081): the
// shared maths (supabase/functions/_shared/salaryShift.ts, re-exported by
// src/shared/lib/salaryShift.js) and every place that sums income by month.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  salaryShiftOf, isShifted, countedDate, countedRow, countedInWindow, shiftFetchFrom, countsForLabel,
} from '../supabase/functions/_shared/salaryShift.ts'
import { spendRows, paidInWindow } from '../src/shared/lib/spread.js'
import { periodTotals, periodProjection } from '../src/features/dashboard/dashboardMath.js'
import { buildTrend } from '../src/features/insights/insightsMath.js'
import { categoryPeriod } from '../src/features/categories/categoryMath.js'
import { expectedInWindow } from '../src/features/recurring/recurringMath.js'
import { buildStatement, salaryNote } from '../supabase/functions/generate-report/statementMath.ts'
import {
  SALARY_SHIFT_DAYS, SALARY_SHIFT_DEFAULT_DAY, defaultSalaryCategoryId, salaryShiftPatch,
} from '../src/features/settings/spendingPrefs.js'

const SAL = 'cat-salary'
const shift = { fromDay: 25, categoryId: SAL }
const pay = (spent_at, extra = {}) => ({
  id: spent_at, kind: 'income', category_id: SAL, amount_minor: 300000, currency: 'EUR', exchange_rate: 1,
  spent_at, categories: { name: 'Salary' }, ...extra,
})

test('salaryShiftOf: on only with a day 1–31 and a category', () => {
  assert.deepEqual(salaryShiftOf({ salary_shift_from_day: 25, salary_category_id: SAL }), shift)
  assert.equal(salaryShiftOf({ salary_shift_from_day: null, salary_category_id: SAL }), null) // off
  assert.equal(salaryShiftOf({ salary_shift_from_day: 25, salary_category_id: null }), null) // category deleted
  assert.equal(salaryShiftOf({ salary_shift_from_day: 0, salary_category_id: SAL }), null)
  assert.equal(salaryShiftOf({ salary_shift_from_day: 32, salary_category_id: SAL }), null)
  assert.equal(salaryShiftOf(null), null)
})

test('D=25: paid on the 24th stays, on the 25th and later counts for the next month', () => {
  assert.equal(isShifted(pay('2026-09-24'), shift), false)
  assert.equal(countedDate(pay('2026-09-24'), shift), '2026-09-24')
  assert.equal(isShifted(pay('2026-09-25'), shift), true)
  assert.equal(countedDate(pay('2026-09-25'), shift), '2026-10-01')
  assert.equal(countedDate(pay('2026-09-30'), shift), '2026-10-01')
})

test('D=31 clamps to short months: from the 28th/29th in February, the 30th in April', () => {
  const d31 = { fromDay: 31, categoryId: SAL }
  assert.equal(isShifted(pay('2026-02-27'), d31), false)
  assert.equal(countedDate(pay('2026-02-28'), d31), '2026-03-01')
  assert.equal(isShifted(pay('2028-02-28'), d31), false) // leap year: from the 29th
  assert.equal(countedDate(pay('2028-02-29'), d31), '2028-03-01')
  assert.equal(countedDate(pay('2026-04-30'), d31), '2026-05-01')
  assert.equal(isShifted(pay('2026-05-30'), d31), false)
  assert.equal(countedDate(pay('2026-05-31'), d31), '2026-06-01')
})

test('December salary counts for January of the next year', () => {
  assert.equal(countedDate(pay('2025-12-30'), shift), '2026-01-01')
  assert.equal(countsForLabel(pay('2025-12-30'), shift), 'Counts for January 2026')
  assert.equal(countsForLabel(pay('2026-09-30'), shift), 'Counts for October')
  assert.equal(countsForLabel(pay('2026-09-10'), shift), null)
})

test('never shifts: setting off, another income category, an expense in the salary category', () => {
  assert.equal(isShifted(pay('2026-09-30'), null), false)
  assert.equal(countedRow(pay('2026-09-30'), null).spent_at, '2026-09-30')
  assert.equal(isShifted(pay('2026-09-30', { category_id: 'cat-bonus' }), shift), false)
  assert.equal(isShifted(pay('2026-09-30', { kind: 'expense' }), shift), false)
  assert.equal(isShifted(pay('2026-09-30', { category_id: null }), shift), false)
  assert.equal(countsForLabel(pay('2026-09-30', { category_id: 'cat-bonus' }), shift), null)
})

test('countedRow: a copy re-dated for sums; other rows are the same object', () => {
  const r = pay('2026-09-30')
  const c = countedRow(r, shift)
  assert.notEqual(c, r)
  assert.equal(c.spent_at, '2026-10-01')
  assert.equal(r.spent_at, '2026-09-30') // the row itself keeps its real date
  const plain = pay('2026-09-03')
  assert.equal(countedRow(plain, shift), plain)
})

test('shiftFetchFrom: day D of the month before, clamped, across the year end', () => {
  assert.equal(shiftFetchFrom('2026-10-01', shift), '2026-09-25')
  assert.equal(shiftFetchFrom('2026-01-01', shift), '2025-12-25')
  assert.equal(shiftFetchFrom('2026-03-01', { fromDay: 31, categoryId: SAL }), '2026-02-28')
  assert.equal(shiftFetchFrom('2026-10-01', null), '2026-10-01') // off
  assert.equal(shiftFetchFrom(null, shift), null) // all time
  assert.equal(shiftFetchFrom(undefined, shift), undefined)
})

// What Home fetches for September and October (spread: true, wider window for
// October) and sums with spendRows.
const rows = [
  pay('2026-10-28', { id: 'oct-late' }),
  pay('2026-10-02', { id: 'oct-bonus', category_id: 'cat-bonus', amount_minor: 50000 }),
  { id: 'rent', kind: 'expense', category_id: 'cat-rent', amount_minor: 90000, currency: 'EUR', exchange_rate: 1,
    spent_at: '2026-10-01', categories: { name: 'Rent' } },
  pay('2026-09-30', { id: 'sep-late' }),
  pay('2026-09-24', { id: 'sep-early', amount_minor: 1000 }),
  pay('2026-08-26', { id: 'aug-late', amount_minor: 7 }),
]
const inRange = (from, to) => rows.filter((r) => r.spent_at >= from && r.spent_at <= to)
const earned = (from, to, s = shift) => periodTotals(
  spendRows(inRange(shiftFetchFrom(from, s) ?? '0000', to ?? '9999'), 'EUR', from, to, { salaryShift: s }), 'EUR').earned

test('Home totals: September excludes the 30 Sep salary, October includes it', () => {
  // September: its own 24 Sep salary, plus August's late one; not 30 Sep.
  assert.equal(earned('2026-09-01', '2026-09-30'), 1000 + 7)
  // October: 30 Sep's salary and the bonus; 28 Oct's counts for November.
  assert.equal(earned('2026-10-01', '2026-10-31'), 300000 + 50000)
  // Off: every row in its own month.
  assert.equal(earned('2026-09-01', '2026-09-30', null), 300000 + 1000)
  assert.equal(earned('2026-10-01', '2026-10-31', null), 50000 + 300000) // the bonus and 28 Oct's
  // Expenses never move.
  const spent = periodTotals(spendRows(inRange('2026-09-25', '2026-10-31'), 'EUR', '2026-10-01', '2026-10-31',
    { salaryShift: shift }), 'EUR').spent
  assert.equal(spent, 90000)
})

test('lists keep the real payment date: the wider fetch never lists the earlier salary', () => {
  const fetched = inRange(shiftFetchFrom('2026-10-01', shift), '2026-10-31')
  assert.deepEqual(paidInWindow(fetched, '2026-10-01', '2026-10-31').map((r) => r.id), ['oct-late', 'oct-bonus', 'rent'])
})

test('a whole year: a 30 Dec 2025 salary counts in 2026, a 30 Dec 2026 one does not', () => {
  const yr = [pay('2026-12-30', { id: 'd26' }), pay('2026-06-10', { id: 'j26', amount_minor: 10 }),
    pay('2025-12-30', { id: 'd25', amount_minor: 5 })]
  const from = '2026-01-01'
  const fetched = yr.filter((r) => r.spent_at >= shiftFetchFrom(from, shift))
  assert.deepEqual(fetched.map((r) => r.id), ['d26', 'j26', 'd25'])
  const got = spendRows(fetched, 'EUR', from, '2026-12-31', { salaryShift: shift })
  assert.deepEqual(got.map((r) => r.id), ['j26', 'd25'])
})

test('all time: the same total with or without the shift', () => {
  const all = (s) => periodTotals(spendRows(rows, 'EUR', null, null, { salaryShift: s }), 'EUR').earned
  assert.equal(all(shift), all(null))
})

test('Insights trend: the salary lands in the month it counts for', () => {
  const months = [{ key: '2026-09', label: 'Sep' }, { key: '2026-10', label: 'Oct' }]
  const trend = buildTrend(spendRows(rows, 'EUR', '2026-09-01', '2026-10-31', { salaryShift: shift }), months, 'EUR')
  assert.deepEqual(trend.map((t) => Math.round(t.income * 100)), [1007, 350000])
})

test('category page: the salary category totals its counted months, lists real payments', () => {
  const fetched = inRange(shiftFetchFrom('2026-10-01', shift), '2026-10-31')
  const p = categoryPeriod(fetched, {
    categoryId: SAL, from: '2026-10-01', to: '2026-10-31', baseCurrency: 'EUR', salaryShift: shift,
  })
  assert.equal(p.total, 300000)
  assert.deepEqual(p.listed.map((r) => r.id), ['oct-late'])
})

test('Home projection: an upcoming salary due from day D counts in the next month', () => {
  const rules = [{ is_active: true, kind: 'income', category_id: SAL, amount_minor: 300000, frequency: 'monthly',
    interval_n: 1, next_run: '2026-09-30', end_date: null }]
  // Today 25 Sep: September's projection leaves it out, the year keeps it.
  assert.deepEqual(periodProjection(rules, '2026-09-30', '2026-09-25', false, shift), { expense: 0, income: 0, savedFromIncome: 0 })
  assert.deepEqual(periodProjection(rules, '2026-09-30', '2026-09-25'), { expense: 0, income: 300000, savedFromIncome: 0 })
  // This year: 30 Sep and 30 Oct count (Oct, Nov); 30 Nov → Dec; 30 Dec → next year.
  assert.equal(periodProjection(rules, '2026-12-31', '2026-09-25', false, shift).income, 3 * 300000)
  assert.equal(expectedInWindow(rules, '2026-09-25', '2026-12-31').income, 4 * 300000)
  // Another category never shifts.
  const other = [{ ...rules[0], category_id: 'cat-bonus' }]
  assert.equal(periodProjection(other, '2026-09-30', '2026-09-25', false, shift).income, 300000)
})

test('statement: totals follow the shift, the list keeps the period, a note explains it', () => {
  const fetched = inRange(shiftFetchFrom('2026-10-01', shift), '2026-10-31')
  const s = buildStatement(fetched, 'EUR', { from: '2026-10-01', to: '2026-10-31', salaryShift: shift })
  assert.equal(s.totalIncome, 3500)
  assert.equal(s.totalSpent, 900)
  assert.deepEqual(s.rows.map((r) => r.date), ['2026-10-01', '2026-10-02', '2026-10-28'])
  assert.equal(s.salaryShiftDay, 25)
  assert.equal(salaryNote(s.salaryShiftDay), 'Salary paid from day 25 of a month counts toward the next month\'s totals.')
  const off = buildStatement(inRange('2026-10-01', '2026-10-31'), 'EUR', { from: '2026-10-01', to: '2026-10-31' })
  assert.equal(off.totalIncome, 3500) // 28 Oct's salary + the bonus, 30 Sep's not fetched
  assert.equal(off.salaryShiftDay, null)
  assert.equal(salaryNote(off.salaryShiftDay), null)
  // A late-September salary still waiting for its rate is reported pending in
  // October (where it would count), never summed.
  const gbp = pay('2026-09-29', { currency: 'GBP', exchange_rate: null })
  const pend = buildStatement([gbp], 'EUR', { from: '2026-10-01', to: '2026-10-31', salaryShift: shift })
  assert.deepEqual([pend.totalIncome, pend.pending], [0, { count: 1, currencies: ['GBP'] }])
  // A period no shifted salary touches has no note.
  const early = buildStatement([pay('2026-09-10')], 'EUR', { from: '2026-09-01', to: '2026-09-30', salaryShift: shift })
  assert.equal(early.salaryShiftDay, null)
})

test('settings: the day picker, the default category and the patch', () => {
  assert.equal(SALARY_SHIFT_DEFAULT_DAY, 25)
  assert.deepEqual([SALARY_SHIFT_DAYS[0], SALARY_SHIFT_DAYS.at(-1), SALARY_SHIFT_DAYS.length], [1, 31, 31])
  const cats = [
    { id: 'b', name: 'Bonus', kind: 'income' },
    { id: 'f', name: 'Freelance', kind: 'income' },
    { id: 's', name: 'Salary', kind: 'income' },
    { id: 'x', name: 'Rent', kind: 'expense' },
  ]
  assert.equal(defaultSalaryCategoryId(cats), 's')
  assert.equal(defaultSalaryCategoryId(cats, 'f'), 'f') // the current choice stays
  assert.equal(defaultSalaryCategoryId(cats, 'x'), 's') // never an expense one
  assert.equal(defaultSalaryCategoryId(cats.filter((c) => c.id !== 's')), 'b') // first income by name
  assert.equal(defaultSalaryCategoryId([{ id: 'x', name: 'Rent', kind: 'expense' }]), null)
  assert.deepEqual(salaryShiftPatch(true, { fromDay: null, categoryId: null, categories: cats }),
    { salary_shift_from_day: 25, salary_category_id: 's' })
  assert.deepEqual(salaryShiftPatch(true, { fromDay: 28, categoryId: 'f', categories: cats }),
    { salary_shift_from_day: 28, salary_category_id: 'f' })
  assert.deepEqual(salaryShiftPatch(false, { fromDay: 25, categoryId: 's', categories: cats }),
    { salary_shift_from_day: null })
})

test('countedInWindow: a late-month salary is listed in the month it counts for', () => {
  const shift = { fromDay: 25, categoryId: 'sal' }
  const salary = { kind: 'income', category_id: 'sal', spent_at: '2026-08-28' }
  const early = { kind: 'income', category_id: 'sal', spent_at: '2026-08-20' }
  const gift = { kind: 'income', category_id: 'gift', spent_at: '2026-08-28' }
  const rows = [salary, early, gift]
  assert.deepEqual(countedInWindow(rows, '2026-08-01', '2026-08-31', shift), [early, gift])
  assert.deepEqual(countedInWindow(rows, '2026-09-01', '2026-09-30', shift), [salary])
  // December's salary is listed in January of the next year.
  const dec = { ...salary, spent_at: '2025-12-30' }
  assert.deepEqual(countedInWindow([dec], '2026-01-01', '2026-12-31', shift), [dec])
  assert.deepEqual(countedInWindow([dec], '2025-01-01', '2025-12-31', shift), [])
  // Setting off, or all time: by the real date / everything.
  assert.deepEqual(countedInWindow(rows, '2026-08-01', '2026-08-31', null), rows)
  assert.deepEqual(countedInWindow(rows, null, null, shift), rows)
})
