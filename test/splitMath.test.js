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

// ---- Form preview: computeSplit / prefillSplitValues ------------------------
import { computeSplit, prefillSplitValues } from '../src/features/groups/splitMath.js'

test('computeSplit: equal split is the SQL split_equally', () => {
  assert.deepEqual(computeSplit('equal', 1000, ['a', 'b', 'c'], {}, 'EUR'),
    { shares: [334, 333, 333], assigned: 1000, ok: true })
  assert.equal(computeSplit('equal', 0, ['a'], {}, 'EUR').ok, false)
  assert.deepEqual(computeSplit('equal', 1000, [], {}, 'EUR'), { shares: [], assigned: 0, ok: false })
})

test('computeSplit: exact amounts must add up to the total', () => {
  const ok = computeSplit('exact', 1000, ['a', 'b'], { a: '6.50', b: '3.5' }, 'EUR')
  assert.deepEqual(ok, { shares: [650, 350], assigned: 1000, ok: true })
  const short = computeSplit('exact', 1000, ['a', 'b'], { a: '6.50' }, 'EUR')
  assert.deepEqual(short, { shares: [650, 0], assigned: 650, ok: false })
  // Zero-decimal group currency: amounts are whole units.
  assert.deepEqual(computeSplit('exact', 1500, ['a', 'b'], { a: '1000', b: '500' }, 'JPY').shares, [1000, 500])
})

test('computeSplit: percent needs 100%, shares need any weight; both apportion exactly', () => {
  const pct = computeSplit('percent', 1000, ['a', 'b', 'c'], { a: '33.3', b: '33.3', c: '33.4' }, 'EUR')
  assert.equal(pct.ok, true)
  assert.equal(pct.shares.reduce((x, y) => x + y, 0), 1000)
  assert.equal(computeSplit('percent', 1000, ['a', 'b'], { a: '50', b: '40' }, 'EUR').ok, false)
  const sh = computeSplit('shares', 1000, ['a', 'b'], { a: '3', b: '1' }, 'EUR')
  assert.deepEqual(sh, { shares: [750, 250], assigned: 1000, ok: true, wsum: 4 })
  assert.equal(computeSplit('shares', 1000, ['a', 'b'], {}, 'EUR').ok, false)
})

test('prefillSplitValues rebuilds the inputs from stored group-currency shares', () => {
  const expense = {
    amount_minor: 900, group_amount_minor: 1000,
    expense_splits: [{ member_id: 'a', share_minor: 750 }, { member_id: 'b', share_minor: 250 }],
  }
  assert.deepEqual(prefillSplitValues(expense, 'exact', 'EUR'), { a: '7.5', b: '2.5' })
  assert.deepEqual(prefillSplitValues(expense, 'percent', 'EUR'), { a: '75', b: '25' })
  assert.deepEqual(prefillSplitValues(expense, 'shares', 'EUR'), { a: '750', b: '250' })
  assert.deepEqual(prefillSplitValues(expense, 'equal', 'EUR'), {})
  assert.deepEqual(prefillSplitValues(null, 'exact', 'EUR'), {})
})

test('prefillSplitValues: a percent split round-trips to the same shares and passes the 100% check', () => {
  const cases = [
    [3334, 3333, 3333],
    [333334, 333333, 333333],
    [1, 1, 1],
    [5000, 5000],
    [1, 2, 99997],
    [700, 0, 300],
  ]
  for (const shares of cases) {
    const total = shares.reduce((a, b) => a + b, 0)
    const ids = shares.map((_, i) => `m${i}`)
    const expense = { amount_minor: total, expense_splits: ids.map((id, i) => ({ member_id: id, share_minor: shares[i] })) }
    const values = prefillSplitValues(expense, 'percent', 'EUR')
    const back = computeSplit('percent', total, ids, values, 'EUR')
    assert.equal(back.ok, true, `${shares} → ${JSON.stringify(values)}`)
    assert.deepEqual(back.shares, shares, `${shares} → ${JSON.stringify(values)}`)
  }
  const three = { amount_minor: 10000, expense_splits: [
    { member_id: 'a', share_minor: 3334 }, { member_id: 'b', share_minor: 3333 }, { member_id: 'c', share_minor: 3333 }] }
  assert.deepEqual(prefillSplitValues(three, 'percent', 'EUR'), { a: '33.34', b: '33.33', c: '33.33' })
})
