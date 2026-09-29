import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeAmountInput, sanitizeSignedAmountInput } from '../src/shared/lib/moneyParse.js'
import { toMinor } from '../src/shared/lib/currency.js'

test('two-decimal input: comma or dot decimal, last separator wins, max two decimals, junk stripped', () => {
  const cases = [
    // Comma is a decimal separator (mobile keypads).
    ['5,50', '5.50'], ['0,5', '0.5'], ['1234,56', '1234.56'],
    // Dot input passes through.
    ['5.50', '5.50'], ['12', '12'],
    // Pasted mixed separators: the last one wins as decimal.
    ['1,234.56', '1234.56'], ['1.234,56', '1234.56'],
    // Max two decimals, a single decimal point, junk stripped.
    ['9,999', '9.99'], ['1.2.3', '1.23'], ['abc', ''], ['€ 12,30', '12.30'],
  ]
  for (const [input, want] of cases) assert.equal(sanitizeAmountInput(input), want, input)
})

test('signed input keeps a leading minus, sanitises the rest', () => {
  assert.equal(sanitizeSignedAmountInput('-5,50'), '-5.50')
  assert.equal(sanitizeSignedAmountInput('−12'), '-12')
  assert.equal(sanitizeSignedAmountInput('-'), '-')
  assert.equal(sanitizeSignedAmountInput('12-3'), '123')
  assert.equal(sanitizeSignedAmountInput('1.234,56'), '1234.56')
})

test('zero-decimal currencies: "," and "." are grouping, no decimals kept', () => {
  for (const cur of ['JPY', 'KRW', 'ISK', 'VND', 'CLP']) {
    assert.equal(sanitizeAmountInput('1,500', cur), '1500', cur)
    assert.equal(sanitizeAmountInput('1.500', cur), '1500', cur)
    assert.equal(sanitizeAmountInput('1,234,567', cur), '1234567', cur)
    assert.equal(sanitizeAmountInput('¥ 2 000', cur), '2000', cur)
    assert.equal(sanitizeAmountInput('1500.5', cur), '15005', cur)
    assert.equal(sanitizeSignedAmountInput('-1.500', cur), '-1500', cur)
  }
})

test('two-decimal currencies (and no currency) keep the decimal-separator rules', () => {
  for (const cur of ['EUR', 'HUF', 'IDR', undefined]) {
    assert.equal(sanitizeAmountInput('1,50', cur), '1.50', String(cur))
    assert.equal(sanitizeAmountInput('1.234,56', cur), '1234.56', String(cur))
  }
})

test('a zero-decimal amount typed with grouping converts to the right minor units', () => {
  assert.equal(toMinor(sanitizeAmountInput('1,500', 'JPY'), 'JPY'), 1500)
  assert.equal(toMinor(sanitizeAmountInput('1,500', 'EUR'), 'EUR'), 150)
})
