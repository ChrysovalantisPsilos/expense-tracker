import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeAmountInput } from '../src/shared/lib/moneyParse.js'

test('comma is a decimal separator (mobile keypads)', () => {
  assert.equal(sanitizeAmountInput('5,50'), '5.50')
  assert.equal(sanitizeAmountInput('0,5'), '0.5')
  assert.equal(sanitizeAmountInput('1234,56'), '1234.56')
})

test('dot input passes through', () => {
  assert.equal(sanitizeAmountInput('5.50'), '5.50')
  assert.equal(sanitizeAmountInput('12'), '12')
})

test('pasted mixed separators: last one wins as decimal', () => {
  assert.equal(sanitizeAmountInput('1,234.56'), '1234.56')
  assert.equal(sanitizeAmountInput('1.234,56'), '1234.56')
})

test('max two decimals, single decimal point, junk stripped', () => {
  assert.equal(sanitizeAmountInput('9,999'), '9.99')
  assert.equal(sanitizeAmountInput('1.2.3'), '1.23')
  assert.equal(sanitizeAmountInput('abc'), '')
  assert.equal(sanitizeAmountInput('€ 12,30'), '12.30')
})
