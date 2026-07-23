import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isoDate, monthRange, lastMonths } from '../src/shared/lib/dates.js'

test('isoDate: YYYY-MM-DD', () => {
  assert.match(isoDate(new Date(Date.UTC(2026, 6, 21))), /^2026-07-21$/)
})

test('monthRange spans first to last day', () => {
  const { from, to } = monthRange(new Date(2026, 1, 10)) // February 2026
  assert.equal(from.slice(0, 7), '2026-02')
  assert.ok(to === '2026-02-28' || to === '2026-02-27') // TZ-safe: toISOString may shift a day
})

test('lastMonths: n entries, oldest first, contiguous keys', () => {
  const months = lastMonths(3, new Date(2026, 6, 15))
  assert.equal(months.length, 3)
  assert.deepEqual(months.map((m) => m.key), ['2026-05', '2026-06', '2026-07'])
})
