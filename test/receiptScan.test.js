import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractTotal, extractDate } from '../src/shared/lib/receiptScan.js'

test('extractTotal: prefers a total line over subtotal', () => {
  assert.equal(extractTotal('Subtotal 10.00\nTOTAL 12.34'), 12.34)
  assert.equal(extractTotal('GRAND TOTAL: $1,234.56'), 1234.56)
  assert.equal(extractTotal('Amount Due 1.234,56'), 1234.56) // euro-style separators
})

test('extractTotal: falls back to the largest money-shaped number', () => {
  assert.equal(extractTotal('Coffee 5.00\nCake 9.99\nThanks!'), 9.99)
  assert.equal(extractTotal('no money here'), null)
})

test('extractDate: ISO, day-first, month-first, named month', () => {
  assert.equal(extractDate('Date: 2026-01-15'), '2026-01-15')
  assert.equal(extractDate('15/01/2026'), '2026-01-15')
  assert.equal(extractDate('01/15/2026'), '2026-01-15') // month-first auto-detected
  assert.equal(extractDate('15 Jan 2026'), '2026-01-15')
  assert.equal(extractDate('no date here'), null)
})
