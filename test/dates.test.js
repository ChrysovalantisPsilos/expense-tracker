import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isoDate, monthRange, monthTitle, lastMonths, shortDate, shortDateTime,
} from '../src/shared/lib/dates.js'

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

test('monthTitle: full month name and year', () => {
  assert.equal(monthTitle(new Date(2026, 8, 22)), 'September 2026')
})

test('shortDate: day + short month, year only outside the current year', () => {
  const now = new Date(2026, 8, 22)
  assert.equal(shortDate('2026-09-21', now), '21 Sep')
  assert.equal(shortDate('2026-10-01', now), '1 Oct')
  assert.equal(shortDate('2025-12-31', now), '31 Dec 2025')
  assert.equal(shortDate('2027-01-05', now), '5 Jan 2027')
})

test('shortDate: timestamps use their date part; bad input passes through', () => {
  const now = new Date(2026, 8, 22)
  assert.equal(shortDate('2026-09-08T23:30:00+00:00', now), '8 Sep')
  assert.equal(shortDate('', now), '')
  assert.equal(shortDate(null, now), '')
  assert.equal(shortDate('soon', now), 'soon')
  assert.equal(shortDate('2026-13-01', now), '2026-13-01')
})

test('shortDate: defaults to the real current year', () => {
  const y = new Date().getFullYear()
  assert.equal(shortDate(`${y}-03-04`), '4 Mar')
  assert.equal(shortDate(`${y - 1}-03-04`), `4 Mar ${y - 1}`)
})

test('shortDateTime: local day, month and 24h time', () => {
  const now = new Date(2026, 8, 22)
  assert.equal(shortDateTime(new Date(2026, 8, 21, 14, 5), now), '21 Sep, 14:05')
  assert.equal(shortDateTime(new Date(2025, 0, 2, 9, 0), now), '2 Jan 2025, 09:00')
  assert.equal(shortDateTime('not a date', now), '')
})
