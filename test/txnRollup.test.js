import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bucketOf, groupLabel, sumToBaseByKey } from '../src/shared/lib/txnRollup.js'

test('bucketOf: group expenses roll up under the group name (else Group); personal rows use their category, else Uncategorized', () => {
  assert.equal(bucketOf({ group_expense_id: 'g1', group_expenses: { groups: { name: 'Trip' } } }), 'Trip')
  assert.equal(bucketOf({ group_expense_id: 'g1', group_expenses: null }), 'Group')
  assert.equal(bucketOf({ categories: { name: 'Food' } }), 'Food')
  assert.equal(bucketOf({}), 'Uncategorized')
})

test('groupLabel: group name or Group fallback', () => {
  assert.equal(groupLabel({ group_expenses: { groups: { name: 'Flat' } } }), 'Flat')
  assert.equal(groupLabel({}), 'Group')
})

test('sumToBaseByKey: sums per key, converts to base at the captured rate, skips null keys', () => {
  const rows = [
    { amount_minor: 1000, exchange_rate: 1, currency: 'EUR', cat: 'a' },
    { amount_minor: 500, exchange_rate: 1, currency: 'EUR', cat: 'a' },
    { amount_minor: 2000, exchange_rate: 1, currency: 'EUR', cat: 'b' },
    { amount_minor: 999, exchange_rate: 1, currency: 'EUR', cat: null }, // skipped
  ]
  const m = sumToBaseByKey(rows, 'EUR', (r) => r.cat)
  assert.equal(m.get('a'), 1500)
  assert.equal(m.get('b'), 2000)
  assert.equal(m.has(null), false)
  // 1000 minor USD at rate 0.9 -> 900 minor EUR (same decimals).
  const usd = sumToBaseByKey([{ amount_minor: 1000, exchange_rate: 0.9, currency: 'USD', cat: 'x' }], 'EUR', (r) => r.cat)
  assert.equal(usd.get('x'), 900)
})
