import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildPeriods, periodFromValue, isMonthPeriod, withPeriod, thisMonthPeriod, isThisMonth, periodMonth, lastPayMonths,
  periodWithRange,
} from '../src/shared/lib/periods.js'
import { payCalendar } from '../src/shared/lib/payCalendar.js'

const NOW = new Date(2026, 6, 15) // 2026-07-15

test('no data: only This month', () => {
  const p = buildPeriods(null, NOW)
  assert.equal(p.length, 1)
  assert.equal(p[0].label, 'This month')
  assert.equal(p[0].from, '2026-07-01')
})

test('data since May: three months + this year, no All time gap-fill missing', () => {
  const p = buildPeriods('2026-05-10', NOW)
  const labels = p.map((x) => x.label)
  assert.deepEqual(labels.slice(0, 3), ['This month', 'June 2026', 'May 2026'])
  assert.ok(labels.includes('This year'))
  assert.ok(p.some((x) => x.value === 'all'))
})

test('data spanning years includes each year', () => {
  const p = buildPeriods('2024-12-01', NOW)
  const years = p.filter((x) => x.value.startsWith('y:')).map((x) => x.label)
  assert.deepEqual(years, ['This year', '2025', '2024'])
})

test('oldest in current month: no All time; the oldest date is a local calendar date in every timezone (no UTC shift)', () => {
  const saved = process.env.TZ
  try {
    for (const tz of ['UTC', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
      process.env.TZ = tz
      const p = buildPeriods('2026-07-01', new Date(2026, 6, 15))
      assert.deepEqual(p.map((x) => x.value), ['m:2026-7', 'y:2026'], tz)
      assert.deepEqual(buildPeriods('2026-01-01', new Date(2026, 6, 15)).filter((x) => x.value.startsWith('y:'))
        .map((x) => x.value), ['y:2026'], tz)
    }
  } finally {
    if (saved === undefined) delete process.env.TZ
    else process.env.TZ = saved
  }
})

test('REGRESSION: all transactions future-dated must not return empty', () => {
  const p = buildPeriods('2026-09-01', NOW)
  assert.ok(p.length >= 1)
  assert.equal(p[0].label, 'This month')
})

test('periodFromValue: reads every buildPeriods token back to the same period', () => {
  for (const p of buildPeriods('2024-11-03', NOW)) {
    assert.deepEqual(periodFromValue(p.value, NOW), p)
  }
})

test('periodFromValue: months/years outside the data range still parse; junk is null', () => {
  assert.deepEqual(periodFromValue('m:2020-2', NOW),
    { value: 'm:2020-2', key: '2020-02', label: 'February 2020', from: '2020-02-01', to: '2020-02-29', open: false })
  assert.equal(periodFromValue('y:2019', NOW).to, '2019-12-31')
  for (const bad of [null, '', 'm:2026-13', 'm:2026-0', 'y:26', 'm:2026-7;drop', 'ALL']) {
    assert.equal(periodFromValue(bad, NOW), null, String(bad))
  }
})

test('withPeriod: keeps the list when the period is in it, else puts it first', () => {
  const list = buildPeriods('2026-05-10', NOW)
  assert.equal(withPeriod(list, periodFromValue('m:2026-6', NOW)), list)
  const old = periodFromValue('m:2020-2', NOW)
  assert.deepEqual(withPeriod(list, old), [old, ...list])
})

test('isMonthPeriod: only single months', () => {
  assert.equal(isMonthPeriod(periodFromValue('m:2026-7', NOW)), true)
  assert.equal(isMonthPeriod(periodFromValue('y:2026', NOW)), false)
  assert.equal(isMonthPeriod(periodFromValue('all', NOW)), false)
  assert.equal(isMonthPeriod(null), false)
})

import { isPastPeriod } from '../src/shared/lib/periods.js'

test('isPastPeriod: only periods that ended before today', () => {
  const d = new Date(2026, 8, 25)
  const today = '2026-09-25'
  assert.equal(isPastPeriod(periodFromValue('m:2026-9', d), today), false)
  assert.equal(isPastPeriod(periodFromValue('m:2026-10', d), today), false)
  assert.equal(isPastPeriod(periodFromValue('y:2026', d), today), false)
  assert.equal(isPastPeriod(periodFromValue('all', d), today), false)
  assert.equal(isPastPeriod(periodFromValue('m:2026-8', d), today), true)
  assert.equal(isPastPeriod(periodFromValue('y:2025', d), today), true)
})

// Pay months (the salary setting): a 29 Sep payday opens October.
const SEP29 = new Date(2026, 8, 29)
const SHIFT = { fromDay: 25, categoryId: 'salary' }
const CAL = payCalendar(SHIFT, ['2026-08-28', '2026-09-29'], '2026-09-29')

test('pay months: October is "This month" on 29 Sep, from its payday; no month ahead is offered', () => {
  const oct = thisMonthPeriod(SEP29, CAL)
  assert.deepEqual(oct, {
    value: 'm:2026-10', key: '2026-10', label: 'This month', from: '2026-09-29', to: '2026-10-31', open: true,
    range: 'from 29 Sep',
  })
  assert.equal(periodWithRange(oct), 'This month · from 29 Sep')
  const p = buildPeriods('2026-05-10', SEP29, { cal: CAL })
  assert.deepEqual(p.slice(0, 3).map((x) => x.label), ['This month', 'September 2026', 'August 2026'])
  assert.equal(p.find((x) => x.value === 'm:2026-9').range, '28 Aug – 28 Sep')
  assert.equal(isThisMonth(p[0], SEP29, CAL), true)
  assert.equal(isThisMonth(p[1], SEP29, CAL), false)
  // The day before the payday is still September's.
  assert.equal(thisMonthPeriod(new Date(2026, 8, 28), CAL).value, 'm:2026-9')
  assert.deepEqual(periodFromValue('m:2026-10', SEP29, CAL), oct)
})

test('pay months: a closed month is past once its window ended', () => {
  const cal = payCalendar(SHIFT, ['2026-08-28', '2026-09-29', '2026-10-28'], '2026-10-29')
  const oct = periodFromValue('m:2026-10', new Date(2026, 9, 29), cal)
  assert.deepEqual([oct.from, oct.to, oct.open], ['2026-09-29', '2026-10-27', false])
  assert.equal(isPastPeriod(oct, '2026-10-29'), true)
  assert.equal(isPastPeriod(thisMonthPeriod(new Date(2026, 9, 29), cal), '2026-10-29'), false)
})

test('periodMonth: the budget key from the month\'s label, never its window', () => {
  assert.equal(periodMonth(thisMonthPeriod(SEP29, CAL)), '2026-10-01')
  assert.equal(periodMonth(periodFromValue('m:2026-9', SEP29)), '2026-09-01')
  assert.equal(periodMonth(periodFromValue('y:2026', SEP29)), null)
  assert.equal(periodMonth(null), null)
})

test('pay months: years run from January\'s start to December\'s end', () => {
  const cal = payCalendar(SHIFT, ['2026-11-27', '2026-12-30'], '2027-01-05')
  const y2027 = periodFromValue('y:2027', new Date(2027, 0, 5), cal)
  assert.equal(y2027.from, '2026-12-30')
  assert.equal(y2027.label, 'This year')
  assert.equal(periodFromValue('y:2026', new Date(2027, 0, 5), cal).to, '2026-12-29')
  // On 30 Dec after payday, the current pay month is January: "This year" is 2027.
  const p = buildPeriods('2026-11-01', new Date(2026, 11, 30), { cal: payCalendar(SHIFT, ['2026-11-27', '2026-12-30'], '2026-12-30') })
  assert.equal(p[0].value, 'm:2027-1')
  assert.deepEqual(p.filter((x) => x.value.startsWith('y:')).map((x) => [x.value, x.label]),
    [['y:2027', 'This year'], ['y:2026', '2026']])
})

test('lastPayMonths: the last n pay months, the current last; calendar months without a calendar', () => {
  const months = lastPayMonths(3, SEP29, CAL)
  assert.deepEqual(months.map((m) => [m.key, m.label, m.from, m.to, m.open]), [
    ['2026-08', 'Aug', '2026-08-01', '2026-08-27', false],
    ['2026-09', 'Sep', '2026-08-28', '2026-09-28', false],
    ['2026-10', 'Oct', '2026-09-29', '2026-10-31', true],
  ])
  assert.deepEqual(lastPayMonths(2, SEP29).map((m) => [m.key, m.from, m.to]),
    [['2026-08', '2026-08-01', '2026-08-31'], ['2026-09', '2026-09-01', '2026-09-30']])
})

test('pay months: the local calendar in every timezone', () => {
  const saved = process.env.TZ
  try {
    for (const tz of ['UTC', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
      process.env.TZ = tz
      assert.equal(buildPeriods('2026-09-01', new Date(2026, 8, 29), { cal: CAL })[0].value, 'm:2026-10', tz)
      assert.equal(thisMonthPeriod(new Date(2026, 8, 28), CAL).value, 'm:2026-9', tz)
    }
  } finally {
    if (saved === undefined) delete process.env.TZ
    else process.env.TZ = saved
  }
})

test('thisMonthPeriod / isThisMonth: the default; null and other periods are not', () => {
  const p = buildPeriods('2026-05-10', SEP29)
  assert.deepEqual(thisMonthPeriod(SEP29), p[0])
  assert.equal(thisMonthPeriod(SEP29).label, 'This month')
  assert.equal(isThisMonth(p[0], SEP29), true)
  assert.equal(isThisMonth(p[1], SEP29), false)
  assert.equal(isThisMonth(periodFromValue('y:2026', SEP29), SEP29), false)
  assert.equal(isThisMonth(null, SEP29), false)
})
