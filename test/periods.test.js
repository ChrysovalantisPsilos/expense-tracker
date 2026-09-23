import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildPeriods, periodFromValue, isMonthPeriod, withPeriod } from '../src/features/transactions/periods.js'

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

test('oldest in current month: no All time, still non-empty', () => {
  const p = buildPeriods('2026-07-01', NOW)
  assert.ok(p.length >= 1)
  assert.ok(!p.some((x) => x.value === 'all'))
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
