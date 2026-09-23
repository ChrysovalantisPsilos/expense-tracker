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
