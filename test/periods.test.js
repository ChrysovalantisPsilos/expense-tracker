import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildPeriods, periodFromValue, isMonthPeriod, withPeriod, thisMonthPeriod, isThisMonth, nextMonthStart,
} from '../src/shared/lib/periods.js'

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
    { value: 'm:2020-2', label: 'February 2020', from: '2020-02-01', to: '2020-02-29' })
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

test('isPastPeriod: only periods that ended before today; next month is not past', () => {
  const d = new Date(2026, 8, 25)
  const today = '2026-09-25'
  assert.equal(isPastPeriod(periodFromValue('m:2026-9', d), today), false)
  assert.equal(isPastPeriod(periodFromValue('m:2026-10', d), today), false)
  assert.equal(isPastPeriod(periodFromValue('y:2026', d), today), false)
  assert.equal(isPastPeriod(periodFromValue('all', d), today), false)
  assert.equal(isPastPeriod(periodFromValue('m:2026-8', d), today), true)
  assert.equal(isPastPeriod(periodFromValue('y:2025', d), today), true)
})

// Next month (the salary setting: a salary paid on the 28th counts for it).
const SEP29 = new Date(2026, 8, 29)

test('next month: offered first once an entry counts in it, labelled like any month', () => {
  const p = buildPeriods('2026-05-10', SEP29, { newestISO: '2026-10-01' })
  assert.deepEqual(p.slice(0, 3).map((x) => x.label), ['October 2026', 'This month', 'August 2026'])
  assert.deepEqual(p[0], periodFromValue('m:2026-10', SEP29))
  assert.deepEqual(p[0], { value: 'm:2026-10', label: 'October 2026', from: '2026-10-01', to: '2026-10-31' })
  // It's still this year: no extra year option.
  assert.deepEqual(p.filter((x) => x.value.startsWith('y:')).map((x) => x.label), ['This year'])
})

test('next month: not offered without a counted date past this month; a later one is clamped to next month', () => {
  for (const newestISO of [undefined, null, '2026-09-30', '2026-01-01']) {
    assert.deepEqual(buildPeriods('2026-05-10', SEP29, { newestISO }), buildPeriods('2026-05-10', SEP29),
      String(newestISO))
  }
  const p = buildPeriods('2026-05-10', SEP29, { newestISO: '2027-03-01' })
  assert.equal(p[0].value, 'm:2026-10')
  assert.equal(p.filter((x) => x.value === 'm:2026-11' || x.value.startsWith('m:2027')).length, 0)
})

test('next month: December offers January, and no year option for next year', () => {
  const dec = new Date(2026, 11, 29)
  const p = buildPeriods('2026-05-10', dec, { newestISO: '2027-01-01' })
  assert.deepEqual(p.slice(0, 2).map((x) => x.value), ['m:2027-1', 'm:2026-12'])
  assert.equal(p[0].label, 'January 2027')
  assert.deepEqual(p.filter((x) => x.value.startsWith('y:')).map((x) => x.value), ['y:2026'])
})

test('next month: offered with this month only, when all data is this month or unknown', () => {
  assert.deepEqual(buildPeriods('2026-09-28', SEP29, { newestISO: '2026-10-01' }).map((x) => x.value),
    ['m:2026-10', 'm:2026-9', 'y:2026'])
  assert.deepEqual(buildPeriods(undefined, SEP29, { newestISO: '2026-10-01' }).map((x) => x.value),
    ['m:2026-10', 'm:2026-9'])
})

test('next month: the local calendar in every timezone', () => {
  const saved = process.env.TZ
  try {
    for (const tz of ['UTC', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
      process.env.TZ = tz
      const d = new Date(2026, 8, 29)
      assert.equal(buildPeriods('2026-09-01', d, { newestISO: '2026-10-01' })[0].value, 'm:2026-10', tz)
      assert.equal(nextMonthStart(d), '2026-10-01', tz)
      assert.equal(nextMonthStart(new Date(2026, 11, 31)), '2027-01-01', tz)
    }
  } finally {
    if (saved === undefined) delete process.env.TZ
    else process.env.TZ = saved
  }
})

test('thisMonthPeriod / isThisMonth: the default, even with next month listed first', () => {
  const p = buildPeriods('2026-05-10', SEP29, { newestISO: '2026-10-01' })
  assert.deepEqual(thisMonthPeriod(SEP29), p[1])
  assert.equal(thisMonthPeriod(SEP29).label, 'This month')
  assert.equal(isThisMonth(p[0], SEP29), false)
  assert.equal(isThisMonth(p[1], SEP29), true)
  assert.equal(isThisMonth(periodFromValue('y:2026', SEP29), SEP29), false)
  assert.equal(isThisMonth(null, SEP29), false)
})
