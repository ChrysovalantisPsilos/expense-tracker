import { test } from 'node:test'
import assert from 'node:assert/strict'
import { budgetPercent, budgetTone } from '../src/features/budgets/budgetMath.js'

test('budgetTone: under 80% of the cap keeps the default fill', () => {
  assert.equal(budgetTone(0, 10000), undefined)
  assert.equal(budgetTone(7999, 10000), undefined)
})

test('budgetTone: from 80% up to the cap warns', () => {
  assert.equal(budgetTone(8000, 10000), 'warning')
  assert.equal(budgetTone(10000, 10000), 'warning')
})

test('budgetTone: any spend over the cap is negative', () => {
  assert.equal(budgetTone(10001, 10000), 'negative')
  assert.equal(budgetTone(1, 0), 'negative')
})

test('budgetTone: a zero cap with no spend is neutral', () => {
  assert.equal(budgetTone(0, 0), undefined)
})

test('budgetPercent: whole percent of the cap, unclamped', () => {
  assert.equal(budgetPercent(31240, 40000), 78)
  assert.equal(budgetPercent(18690, 15000), 125)
  assert.equal(budgetPercent(0, 10000), 0)
  assert.equal(budgetPercent(333, 1000), 33)
})

test('budgetPercent: a zero cap reads 0 (over-budget comes from budgetTone)', () => {
  assert.equal(budgetPercent(500, 0), 0)
  assert.equal(budgetPercent(0, 0), 0)
})

// ---- Rollover ---------------------------------------------------------------
import { previousPeriod, carriedFrom, carriedLabel } from '../src/features/budgets/budgetMath.js'

test('previousPeriod: the month before, across a year boundary', () => {
  assert.equal(previousPeriod('2026-09-01'), '2026-08-01')
  assert.equal(previousPeriod('2026-01-01'), '2025-12-01')
  assert.equal(previousPeriod('2026-10-01'), '2026-09-01')
})

test('carriedFrom: rows from an earlier month are carried; own rows or none are not', () => {
  assert.equal(carriedFrom([{ period_start: '2026-08-01' }, { period_start: '2026-08-01' }], '2026-09-01'), '2026-08-01')
  assert.equal(carriedFrom([{ period_start: '2026-09-01' }], '2026-09-01'), null)
  assert.equal(carriedFrom([], '2026-09-01'), null)
  assert.equal(carriedFrom(undefined, '2026-09-01'), null)
})

test('carriedLabel: month name, with the year only when it differs', () => {
  assert.equal(carriedLabel('2026-08-01', '2026-09-01', 'en-GB'), 'Carried over from August')
  assert.equal(carriedLabel('2025-12-01', '2026-01-01', 'en-GB'), 'Carried over from December 2025')
})
