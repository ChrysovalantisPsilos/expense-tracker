import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildPeriods } from '../src/features/transactions/periods.js'

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
