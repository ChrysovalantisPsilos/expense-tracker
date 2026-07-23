import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toMinor, fromMinor, formatMoney, toBaseMinor, minorFactor } from '../src/shared/lib/currency.js'

test('toMinor/fromMinor round-trip (2-decimal currency)', () => {
  assert.equal(toMinor('12.34', 'EUR'), 1234)
  assert.equal(fromMinor(1234, 'EUR'), 12.34)
})

test('zero-decimal currencies use factor 1', () => {
  assert.equal(minorFactor('JPY'), 1)
  assert.equal(toMinor('500', 'JPY'), 500)
  assert.equal(fromMinor(500, 'JPY'), 500)
})

test('toMinor rounds instead of truncating float artefacts', () => {
  // 19.90 * 100 === 1989.9999… in floats; must land on 1990.
  assert.equal(toMinor('19.90', 'EUR'), 1990)
})

test('formatMoney renders the currency', () => {
  const s = formatMoney(1234, 'EUR')
  assert.ok(s.includes('12.34') || s.includes('12,34'), s)
})

test('toBaseMinor applies the captured exchange rate', () => {
  // 100.00 USD at rate 0.9 -> 90.00 EUR
  assert.equal(toBaseMinor(10000, 0.9, 'USD', 'EUR'), 9000)
  // Same currency: rate ignored/1 — amount unchanged.
  assert.equal(toBaseMinor(10000, 1, 'EUR', 'EUR'), 10000)
})
