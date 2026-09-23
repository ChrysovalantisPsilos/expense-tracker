import { test } from 'node:test'
import assert from 'node:assert/strict'
import { distributeByWeights, splitEqually, simplifyDebts } from '../src/features/groups/splitMath.js'

test('splitEqually: exact division', () => {
  assert.deepEqual(splitEqually(900, 3), [300, 300, 300])
})

test('splitEqually: leftover cents go to earliest people', () => {
  assert.deepEqual(splitEqually(1000, 3), [334, 333, 333])
  assert.equal(splitEqually(1000, 3).reduce((a, b) => a + b, 0), 1000)
})

test('splitEqually: zero and negative count', () => {
  assert.deepEqual(splitEqually(500, 0), [])
  assert.deepEqual(splitEqually(500, -1), [])
})

test('distributeByWeights: sums exactly to total', () => {
  const out = distributeByWeights(1001, [1, 1, 1])
  assert.equal(out.reduce((a, b) => a + b, 0), 1001)
})

test('distributeByWeights: proportional', () => {
  assert.deepEqual(distributeByWeights(1000, [3, 1]), [750, 250])
})

test('distributeByWeights: zero weights produce zeros', () => {
  assert.deepEqual(distributeByWeights(1000, [0, 0]), [0, 0])
})

test('simplifyDebts: two-person debt', () => {
  const plan = simplifyDebts(new Map([['a', 500], ['b', -500]]))
  assert.deepEqual(plan, [{ from: 'b', to: 'a', amount: 500 }])
})

test('simplifyDebts: transfers settle every balance to zero', () => {
  const net = new Map([['a', 700], ['b', -300], ['c', -400], ['d', 0]])
  const plan = simplifyDebts(net)
  const after = new Map(net)
  for (const t of plan) {
    after.set(t.from, after.get(t.from) + t.amount)
    after.set(t.to, after.get(t.to) - t.amount)
  }
  for (const [, v] of after) assert.equal(v, 0)
  // At most n-1 transfers among people with balances.
  assert.ok(plan.length <= 2)
})

test('simplifyDebts: settled group needs no transfers', () => {
  assert.deepEqual(simplifyDebts(new Map([['a', 0], ['b', 0]])), [])
})

// ---- Foreign-currency expenses (lockstep with SQL group_expense_amount) -----
import { expenseGroupAmount } from '../src/features/groups/splitMath.js'

test('expenseGroupAmount: the split total in the group currency, as the server computes it', () => {
  assert.equal(expenseGroupAmount(4250, 'EUR', null, 'EUR'), 4250) // group currency: as entered
  assert.equal(expenseGroupAmount(4250, 'GBP', 1.1699, 'EUR'), 4972) // db_tests #45
  assert.equal(expenseGroupAmount(275, 'JPY', 0.0062, 'EUR'), 171) // tie: floats said 170
  assert.equal(expenseGroupAmount(1800, 'JPY', 0.0062, 'EUR'), 1116) // zero-decimal source
  assert.equal(expenseGroupAmount(1000, 'EUR', 162.35, 'JPY'), 1624) // zero-decimal group
  assert.equal(expenseGroupAmount(4250, 'GBP', null, 'EUR'), null) // no rate yet: no split
  assert.equal(expenseGroupAmount(4250, 'GBP', 0, 'EUR'), null)
})

test('a foreign expense splits its group amount exactly (equal split = SQL split_equally)', () => {
  const total = expenseGroupAmount(4250, 'GBP', 1.1699, 'EUR')
  const shares = splitEqually(total, 3)
  assert.deepEqual(shares, [1658, 1657, 1657]) // db_tests #45: the payer (first) nets 4972 − 1658
  assert.equal(shares.reduce((a, b) => a + b, 0), total)
})
