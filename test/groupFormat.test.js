import { test } from 'node:test'
import assert from 'node:assert/strict'
import { memberName, describeBalance, pluralise, splitLabel, settlePlan } from '../src/features/groups/groupFormat.js'
import { formatMoney } from '../src/shared/lib/currency.js'

const members = [{ id: 'a', display_name: 'Alice' }, { id: 'b', display_name: 'Bob' }]

test('memberName: resolves an id, em-dash for unknown/empty', () => {
  assert.equal(memberName(members, 'a'), 'Alice')
  assert.equal(memberName(members, 'zzz'), '—')
  assert.equal(memberName(null, 'a'), '—')
})

test('describeBalance: owed / owes / settled up', () => {
  assert.equal(describeBalance(0, 'EUR'), 'settled up')
  assert.equal(describeBalance(500, 'EUR'), `owed ${formatMoney(500, 'EUR')}`)
  assert.equal(describeBalance(-500, 'EUR'), `owes ${formatMoney(500, 'EUR')}`)
})

test('pluralise: singular only for exactly one', () => {
  assert.equal(pluralise(1, 'member'), '1 member')
  assert.equal(pluralise(0, 'member'), '0 members')
  assert.equal(pluralise(3, 'member'), '3 members')
  assert.equal(pluralise(1, 'person', 'people'), '1 person')
  assert.equal(pluralise(2, 'person', 'people'), '2 people')
})

test('splitLabel: equal vs custom splits, pluralised', () => {
  const splits = (n) => Array.from({ length: n }, (_, i) => ({ member_id: String(i) }))
  assert.equal(splitLabel({ split_type: 'equal', expense_splits: splits(1) }), 'split 1 way')
  assert.equal(splitLabel({ expense_splits: splits(3) }), 'split 3 ways')
  assert.equal(splitLabel({ split_type: 'exact', expense_splits: splits(1) }), 'custom split · 1 person')
  assert.equal(splitLabel({ split_type: 'shares', expense_splits: splits(4) }), 'custom split · 4 people')
  assert.equal(splitLabel({}), 'split 0 ways')
})

test('settlePlan: fewest payments, named, viewer shown as You and flagged', () => {
  const ms = [{ id: 'y', display_name: 'Alex' }, { id: 'a', display_name: 'Anna' }, { id: 's', display_name: 'Sofia' }]
  const plan = settlePlan(new Map([['y', 1500], ['a', -500], ['s', -1000]]), ms, 'y')
  assert.equal(plan.length, 2)
  assert.deepEqual(plan.map((t) => `${t.fromName}->${t.toName}:${t.amount}:${t.mine}`).sort(),
    ['Anna->You:500:true', 'Sofia->You:1000:true'])
})

test('settlePlan: empty when everyone is settled; others marked not mine', () => {
  const ms = [{ id: 'y', display_name: 'Alex' }, { id: 'a', display_name: 'Anna' }, { id: 'b', display_name: 'Ben' }]
  assert.deepEqual(settlePlan(new Map([['y', 0], ['a', 0]]), ms, 'y'), [])
  const [t] = settlePlan(new Map([['y', 0], ['a', 300], ['b', -300]]), ms, 'y')
  assert.equal(`${t.fromName}->${t.toName}`, 'Ben->Anna')
  assert.equal(t.mine, false)
})
