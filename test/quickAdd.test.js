// "Who's it for?" on the Add form (features/groups/quickAddMath.js): which
// groups it offers and in what order, what carries over between "Just me"
// and a group, and which ?group= link it honours.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  RECENT_MAX, byRecent, carryDraft, memberGroups, splitCountLabel, validGroupParam, withRecent,
} from '../src/features/groups/quickAddMath.js'

const g = (id, created_at) => ({ id, name: id, created_at })
const GROUPS = [g('a', '2026-01-01T00:00:00Z'), g('b', '2026-03-01T00:00:00Z'), g('c', '2026-02-01T00:00:00Z')]
const ids = (list) => list.map((x) => x.id)

test('byRecent: most recently used first, then newest first; inputs left alone', () => {
  assert.deepEqual(ids(byRecent(GROUPS, ['a'])), ['a', 'b', 'c'])
  assert.deepEqual(ids(byRecent(GROUPS, ['c', 'a'])), ['c', 'a', 'b'])
  // Nothing used yet (or only groups the user has left): newest first.
  assert.deepEqual(ids(byRecent(GROUPS, [])), ['b', 'c', 'a'])
  assert.deepEqual(ids(byRecent(GROUPS, ['gone'])), ['b', 'c', 'a'])
  assert.deepEqual(ids(byRecent(GROUPS)), ['b', 'c', 'a'])
  assert.deepEqual(byRecent(null, ['a']), [])
  // It leaves its inputs alone.
  const groups = [...GROUPS]
  byRecent(groups, ['c'])
  assert.deepEqual(groups, GROUPS)
})

test('withRecent: the group moves to the front, without repeats, up to the limit', () => {
  assert.deepEqual(withRecent([], 'a'), ['a'])
  assert.deepEqual(withRecent(['b', 'a', 'c'], 'a'), ['a', 'b', 'c'])
  assert.deepEqual(withRecent(['a', 'b'], 'c', 2), ['c', 'a'])
  const many = Array.from({ length: RECENT_MAX + 5 }, (_, i) => `g${i}`)
  assert.equal(withRecent(many, 'new').length, RECENT_MAX)
  // A corrupt stored value starts a fresh list.
  assert.deepEqual(withRecent({ a: 1 }, 'a'), ['a'])
  assert.deepEqual(withRecent([1, null, 'b'], 'a'), ['a', 'b'])
})

test('memberGroups: only groups the viewer is a member of, with their members', () => {
  const summaries = new Map([
    ['a', { members: [{ id: 'm1', user_id: 'me' }, { id: 'm2', user_id: 'x' }] }],
    ['b', { members: [{ id: 'm3', user_id: 'x' }, { id: 'm4', user_id: null }] }],
  ])
  const mine = memberGroups(GROUPS, summaries, 'me')
  assert.deepEqual(ids(mine), ['a'])
  assert.equal(mine[0].members.length, 2)
  // Members that didn't load: nothing to offer (no payer, no split).
  assert.deepEqual(memberGroups(GROUPS, new Map(), 'me'), [])
  assert.deepEqual(memberGroups(undefined, summaries, 'me'), [])
})

test('validGroupParam: only one of the viewer’s own groups', () => {
  assert.equal(validGroupParam('b', GROUPS), 'b')
  assert.equal(validGroupParam('someone-elses', GROUPS), null)
  assert.equal(validGroupParam('b', []), null)
  assert.equal(validGroupParam(null, GROUPS), null)
  assert.equal(validGroupParam('', GROUPS), null)
})

const draft = (over) => ({ amount: '84.60', currency: 'EUR', currencyPicked: false, description: 'Dinner', spentAt: '2026-09-20', ...over })

test('carryDraft: amount, description and date travel as typed; the amount takes the new currency’s decimals', () => {
  const out = carryDraft(draft(), 'EUR')
  assert.deepEqual(out, draft())
  assert.equal(carryDraft(null, 'EUR'), null)
  assert.equal(carryDraft(draft(), 'JPY').amount, '85')
  assert.equal(carryDraft(draft({ amount: '1800', currency: 'JPY' }), 'EUR').amount, '1800.00')
  assert.equal(carryDraft(draft({ amount: '' }), 'JPY').amount, '')
  assert.equal(carryDraft(draft({ amount: undefined }), 'EUR').amount, '')
})

test('carryDraft: an untouched currency becomes the other side’s default; a picked one travels, if the other side offers it', () => {
  // Just me (EUR base) → a GBP group, and back.
  const toGroup = carryDraft(draft(), 'GBP')
  assert.equal(toGroup.currency, 'GBP')
  assert.equal(toGroup.currencyPicked, false)
  assert.equal(toGroup.amount, '84.60')
  assert.equal(carryDraft(toGroup, 'EUR').currency, 'EUR')
  // A currency the user picked travels…
  const picked = carryDraft(draft({ currency: 'USD', currencyPicked: true }), 'GBP')
  assert.equal(picked.currency, 'USD')
  assert.equal(picked.currencyPicked, true)
  assert.equal(carryDraft(picked, 'EUR').currency, 'USD')
  // …even when it's the same as this side's default.
  assert.equal(carryDraft(draft({ currencyPicked: true }), 'GBP').currency, 'EUR')
  // A picked currency the other side can't offer falls back to its default: a group in a
  // currency outside the app's list, picked there, back on Just me.
  assert.equal(carryDraft(draft({ currency: 'XAF', currencyPicked: true }), 'EUR').currency, 'EUR')
  // …but it stays on that group's own form.
  assert.equal(carryDraft(draft({ currency: 'XAF', currencyPicked: true }), 'XAF').currency, 'XAF')
})

test('splitCountLabel: everyone, or some of them', () => {
  assert.equal(splitCountLabel(4, 4), 'All 4')
  assert.equal(splitCountLabel(3, 4), '3 of 4')
})
