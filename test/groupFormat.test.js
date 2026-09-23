import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  memberName, pluralise, splitLabel, settlePlan, sortMembers, avatarStack,
} from '../src/features/groups/groupFormat.js'

const members = [{ id: 'a', display_name: 'Alice' }, { id: 'b', display_name: 'Bob' }]

test('memberName: resolves an id, em-dash for unknown/empty', () => {
  assert.equal(memberName(members, 'a'), 'Alice')
  assert.equal(memberName(members, 'zzz'), '—')
  assert.equal(memberName(null, 'a'), '—')
})

test('sortMembers: you first, then the owner, then join order; input untouched', () => {
  const ms = [
    { id: 'm1', user_id: 'u1', role: 'member' },
    { id: 'm2', user_id: 'u2', role: 'owner' },
    { id: 'm3', user_id: 'u3', role: 'member' },
    { id: 'm4', user_id: 'u4', role: 'member' },
  ]
  assert.deepEqual(sortMembers(ms, 'u3').map((m) => m.id), ['m3', 'm2', 'm1', 'm4'])
  // You are the owner: you once, then the rest in join order.
  assert.deepEqual(sortMembers(ms, 'u2').map((m) => m.id), ['m2', 'm1', 'm3', 'm4'])
  // Not a member (e.g. mid-leave): owner first.
  assert.deepEqual(sortMembers(ms, 'nobody').map((m) => m.id), ['m2', 'm1', 'm3', 'm4'])
  assert.deepEqual(ms.map((m) => m.id), ['m1', 'm2', 'm3', 'm4'])
  assert.deepEqual(sortMembers(null, 'u1'), [])
})

test('avatarStack: first N shown, the rest counted as overflow', () => {
  const ms = (n) => Array.from({ length: n }, (_, i) => ({ id: String(i) }))
  assert.deepEqual(avatarStack(ms(3)), { shown: ms(3), overflow: 0 })
  assert.deepEqual(avatarStack(ms(4)), { shown: ms(4), overflow: 0 })
  const six = avatarStack(ms(6))
  assert.equal(six.shown.length, 4)
  assert.equal(six.overflow, 2)
  assert.equal(avatarStack(ms(6), 2).overflow, 4)
  assert.deepEqual(avatarStack(null), { shown: [], overflow: 0 })
  assert.deepEqual(avatarStack(ms(2), -1), { shown: [], overflow: 2 })
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
