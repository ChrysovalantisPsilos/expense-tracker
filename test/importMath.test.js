import { test } from 'node:test'
import assert from 'node:assert/strict'
import { merchantKey, parseAmount, parseDate, deterministicUuid } from '../src/features/import/importMath.js'

test('merchantKey: strips bank noise, numbers, dates, branches', () => {
  assert.equal(merchantKey('POS LIDL 1234 NICOSIA 19/07'), 'LIDL')
  assert.equal(merchantKey('LIDL 992 LARNACA'), 'LIDL')
  assert.equal(merchantKey('Netflix.com 12.99'), 'NETFLIX')
  assert.equal(merchantKey('CARD PAYMENT TO IKEA'), 'IKEA')
  assert.equal(merchantKey('ΣΟΥΠΕΡΜΑΡΚΕΤ ΑΛΦΑ 55'), 'ΣΟΥΠΕΡΜΑΡΚΕΤ')
})

test('merchantKey: empty inputs', () => {
  assert.equal(merchantKey(''), '')
  assert.equal(merchantKey(null), '')
  assert.equal(merchantKey('12/07/2026 99.50'), '')
})

test('parseAmount: plain, comma-decimal, mixed separators, junk', () => {
  assert.equal(parseAmount('12.34'), 12.34)
  assert.equal(parseAmount('12,34'), 12.34)
  assert.equal(parseAmount('1,234.56'), 1234.56)
  assert.equal(parseAmount('-45.00'), -45)
  assert.equal(parseAmount(7), 7)
  assert.ok(Number.isNaN(parseAmount('')))
  assert.ok(Number.isNaN(parseAmount(null)))
})

test('parseDate: Date objects keep the local day', () => {
  assert.equal(parseDate(new Date(2026, 6, 21)), '2026-07-21')
})

test('parseDate: strings and invalids', () => {
  assert.equal(parseDate('2026-07-21'), '2026-07-21')
  assert.equal(parseDate(''), null)
  assert.equal(parseDate('not a date'), null)
})

test('deterministicUuid: stable, distinct, uuid-shaped', async () => {
  const a1 = await deterministicUuid(['import', 'u1', 'k', 0])
  const a2 = await deterministicUuid(['import', 'u1', 'k', 0])
  const b = await deterministicUuid(['import', 'u1', 'k', 1])
  assert.equal(a1, a2)
  assert.notEqual(a1, b)
  assert.match(a1, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
})
