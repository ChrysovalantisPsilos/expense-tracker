import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  memberName, pluralise, splitLabel, settlePlan, sortMembers, avatarStack,
  paidByLabel, groupTotal, memberBalances, balanceHighlight, isEveryoneEqualSplit,
  myGroupBalance, mySettleSuggestions, viewerName, expenseLabel, settlementLabel, commentTarget,
  groupDeleteCheck,
} from '../src/features/groups/groupFormat.js'
import { latestSql } from './migrations.js'

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

test('settlePlan: fewest payments, named, viewer shown as You and flagged; others not mine; empty when settled', () => {
  const ms = [{ id: 'y', display_name: 'Alex' }, { id: 'a', display_name: 'Anna' }, { id: 's', display_name: 'Sofia' }]
  const plan = settlePlan(new Map([['y', 1500], ['a', -500], ['s', -1000]]), ms, 'y')
  assert.equal(plan.length, 2)
  assert.deepEqual(plan.map((t) => `${t.fromName}->${t.toName}:${t.amount}:${t.mine}:${t.tone}`).sort(),
    ['Anna->You:500:true:positive', 'Sofia->You:1000:true:positive'])
  // Seen by Sofia: she pays, so her row is negative.
  const [s] = settlePlan(new Map([['y', 1000], ['s', -1000]]), ms, 's')
  assert.equal(`${s.fromName}->${s.toName}:${s.tone}`, 'You->Alex:negative')
  // Empty when everyone is settled; others' payments are marked not mine.
  const withBen = [...ms, { id: 'b', display_name: 'Ben' }]
  assert.deepEqual(settlePlan(new Map([['y', 0], ['a', 0]]), withBen, 'y'), [])
  const [t] = settlePlan(new Map([['y', 0], ['a', 300], ['b', -300]]), withBen, 'y')
  assert.equal(`${t.fromName}->${t.toName}`, 'Ben->Anna')
  assert.equal(t.mine, false)
  assert.equal(t.tone, 'default')
})

test('mySettleSuggestions: only your payments, biggest first, with the form values', () => {
  // You are owed 1500 by Anna (500) and Sofia (1000); Ben and Cara settle between themselves.
  const bal = new Map([['y', 1500], ['a', -500], ['s', -1000], ['b', -200], ['c', 200]])
  const got = mySettleSuggestions(bal, 'y')
  assert.deepEqual(got.map((t) => `${t.direction}:${t.otherId}:${t.amount}`), ['in:s:1000', 'in:a:500'])
  // You owe: direction 'out', the other side is who you pay.
  const [pay] = mySettleSuggestions(new Map([['y', -700], ['a', 700]]), 'y')
  assert.deepEqual({ direction: pay.direction, otherId: pay.otherId, amount: pay.amount },
    { direction: 'out', otherId: 'a', amount: 700 })
  assert.deepEqual(mySettleSuggestions(bal, null), [])
  assert.deepEqual(mySettleSuggestions(undefined, 'y'), [])
})

test('groupTotal: sums the group-currency expenses in minor units, a foreign one at its group amount', () => {
  const ex = [
    { amount_minor: 24000, currency: 'EUR' }, { amount_minor: 8640, currency: 'EUR' },
    { amount_minor: 1860, currency: 'EUR' }, { amount_minor: 1200, currency: 'EUR' },
  ]
  assert.equal(groupTotal(ex, 'EUR'), 35700)
  // A stray other-currency row is left out; a row without a currency counts.
  assert.equal(groupTotal([...ex, { amount_minor: 500, currency: 'GBP' }, { amount_minor: '100' }], 'EUR'), 35800)
  assert.equal(groupTotal([], 'EUR'), 0)
  assert.equal(groupTotal(null, 'EUR'), 0)
  // A foreign-currency expense counts at its group amount.
  assert.equal(groupTotal([
    { amount_minor: 1200, currency: 'EUR' },
    { amount_minor: 4250, currency: 'GBP', exchange_rate: 1.1699, group_amount_minor: 4972 },
  ], 'EUR'), 6172)
})

test('memberBalances: every member, you first as "You", missing rows settled', () => {
  const ms = [
    { id: 'm1', user_id: 'u1', role: 'owner', display_name: 'Alex' },
    { id: 'm2', user_id: 'u2', role: 'member', display_name: 'Anna' },
    { id: 'm3', user_id: 'u3', role: 'member', display_name: 'Marco' },
    { id: 'm4', user_id: 'u4', role: 'member', display_name: 'Sofia' },
  ]
  const bal = new Map([['m1', 16275], ['m2', -285], ['m3', -7065], ['m4', -8925]])
  assert.deepEqual(memberBalances(bal, ms, 'u1').map((b) => `${b.label}:${b.net}:${b.mine}`),
    ['You:16275:true', 'Anna:-285:false', 'Marco:-7065:false', 'Sofia:-8925:false'])
  // Sofia's view: her first, then the owner, then join order.
  assert.deepEqual(memberBalances(bal, ms, 'u4').map((b) => `${b.label}:${b.net}`),
    ['You:-8925', 'Alex:16275', 'Anna:-285', 'Marco:-7065'])
  assert.deepEqual(memberBalances(new Map(), ms.slice(0, 1), 'u1'), [{ id: 'm1', label: 'You', net: 0, mine: true }])
  assert.deepEqual(memberBalances(null, null, 'u1'), [])
})

test('balanceHighlight: your payments in one line, with their total', () => {
  const ms = [
    { id: 'y', display_name: 'Alex' }, { id: 'a', display_name: 'Anna' },
    { id: 'm', display_name: 'Marco' }, { id: 's', display_name: 'Sofia' },
  ]
  const bal = new Map([['y', 16275], ['a', -285], ['m', -7065], ['s', -8925]])
  // Three people owe you: the line counts them and adds up what they owe.
  assert.deepEqual(balanceHighlight(settlePlan(bal, ms, 'y')),
    { text: '3 people owe you', amount: 16275, tone: 'positive' })
  assert.deepEqual(balanceHighlight(settlePlan(bal, ms, 's')),
    { text: 'You owe Alex', amount: 8925, tone: 'negative' })
  // One person owes you: their name.
  assert.deepEqual(balanceHighlight(settlePlan(new Map([['y', 4905], ['a', -4905]]), ms, 'y')),
    { text: 'Anna owes you', amount: 4905, tone: 'positive' })
  // You owe two people.
  assert.deepEqual(balanceHighlight(settlePlan(new Map([['y', -500], ['a', 200], ['m', 300]]), ms, 'y')),
    { text: 'You owe 2 people', amount: 500, tone: 'negative' })
  // Someone else's debts only → nothing for you.
  assert.equal(balanceHighlight(settlePlan(new Map([['y', 0], ['a', 300], ['m', -300]]), ms, 'y')), null)
  assert.equal(balanceHighlight([]), null)
  assert.equal(balanceHighlight(null), null)
  // A tie between receiving and paying favours what you're owed.
  const tie = [
    { mine: true, amount: 500, tone: 'negative', fromName: 'You', toName: 'Anna' },
    { mine: true, amount: 500, tone: 'positive', fromName: 'Marco', toName: 'You' },
  ]
  assert.equal(balanceHighlight(tie).text, 'Marco owes you')
})

test('isEveryoneEqualSplit: only an equal split over exactly the current members', () => {
  const ms = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  const sp = (...ids) => ids.map((member_id) => ({ member_id }))
  assert.equal(isEveryoneEqualSplit({ split_type: 'equal', expense_splits: sp('a', 'b', 'c') }, ms), true)
  assert.equal(isEveryoneEqualSplit({ expense_splits: sp('c', 'a', 'b') }, ms), true) // no type = equal
  assert.equal(isEveryoneEqualSplit({ split_type: 'equal', expense_splits: sp('a', 'b') }, ms), false) // someone left out
  assert.equal(isEveryoneEqualSplit({ split_type: 'equal', expense_splits: sp('a', 'b', 'x') }, ms), false) // a former member
  assert.equal(isEveryoneEqualSplit({ split_type: 'equal', expense_splits: sp('a', 'b', 'c', 'x') }, ms), false)
  assert.equal(isEveryoneEqualSplit({ split_type: 'shares', expense_splits: sp('a', 'b', 'c') }, ms), false) // custom
  assert.equal(isEveryoneEqualSplit({ split_type: 'equal', expense_splits: [] }, []), false)
  assert.equal(isEveryoneEqualSplit(null, ms), false)
})

test('myGroupBalance: owed / owe / settled for the viewer', () => {
  const ms = [{ id: 'm1', user_id: 'u1' }, { id: 'm2', user_id: 'u2' }]
  const bal = new Map([['m1', 16275], ['m2', -16275]])
  assert.deepEqual(myGroupBalance(bal, ms, 'u1'), { label: 'You’re owed', amount: 16275, tone: 'positive' })
  assert.deepEqual(myGroupBalance(bal, ms, 'u2'), { label: 'You owe', amount: 16275, tone: 'negative' })
  const settled = { label: 'Settled up', amount: null, tone: 'muted' }
  assert.deepEqual(myGroupBalance(new Map([['m1', 0]]), ms, 'u1'), settled)
  assert.deepEqual(myGroupBalance(new Map(), ms, 'u1'), settled) // no balance row
  assert.deepEqual(myGroupBalance(bal, ms, 'nobody'), settled)
  assert.deepEqual(myGroupBalance(null, null, 'u1'), settled)
})

import { groupSummaryText } from '../src/features/groups/groupFormat.js'

test('groupSummaryText: total and who owes whom by name, text only', () => {
  const ms = [
    { id: 'm1', user_id: 'u1', display_name: 'Alex' }, { id: 'm2', user_id: 'u2', display_name: 'Sofia' },
    { id: 'm3', user_id: 'u3', display_name: 'Anna' },
  ]
  const format = (m) => `€${(m / 100).toFixed(2)}`
  const text = groupSummaryText({
    name: 'Lisbon weekend', total: 35700, members: ms, format,
    balances: new Map([['m1', 16275], ['m2', -8925], ['m3', -7350]]),
  })
  assert.equal(text, [
    'Lisbon weekend: €357.00 spent in total', '',
    'To settle up (2 payments):',
    '• Sofia owes Alex €89.25',
    '• Anna owes Alex €73.50', '',
    'Shared from Budgeer',
  ].join('\n'))
  assert.ok(!/You/.test(text))
  const settled = groupSummaryText({ name: 'Flat', total: 0, members: ms, format, balances: new Map() })
  assert.match(settled, /Everyone is settled up\./)
})

test('viewerName / paidByLabel: "You" for the viewer, the member\'s name otherwise', () => {
  const ms = [{ id: 'y', display_name: 'Alex' }, { id: 'a', display_name: 'Anna' }]
  assert.equal(viewerName(ms, 'y', 'y'), 'You')
  assert.equal(viewerName(ms, 'a', 'y'), 'Anna')
  assert.equal(viewerName(ms, 'y', null), 'Alex')
  assert.equal(viewerName(ms, 'zzz', 'y'), '—')
  assert.equal(paidByLabel(members, 'a', 'a'), 'Paid by You')
  assert.equal(paidByLabel(members, 'b', 'a'), 'Paid by Bob')
  assert.equal(paidByLabel(members, 'zzz', 'a'), 'Paid by —')
})

test('expenseLabel / settlementLabel: the names rows and comment pages use', () => {
  const ms = [{ id: 'y', display_name: 'Alex' }, { id: 'a', display_name: 'Anna' }]
  assert.equal(expenseLabel({ description: 'Taxi' }), 'Taxi')
  assert.equal(expenseLabel({ description: '' }), 'Expense')
  assert.equal(expenseLabel(null), 'Expense')
  assert.equal(settlementLabel({ from_member: 'a', to_member: 'y' }, ms, 'y'), 'Anna → You')
  assert.equal(settlementLabel({ from_member: 'y', to_member: 'a' }, ms, null), 'Alex → Anna')
})

test('commentTarget: finds an expense or a settlement by id, null otherwise', () => {
  const ms = [{ id: 'y', display_name: 'Alex' }, { id: 'a', display_name: 'Anna' }]
  const ledger = {
    members: ms,
    expenses: [{ id: 'e1', description: 'Dinner' }, { id: 'e2', description: null }],
    settlements: [{ id: 's1', from_member: 'a', to_member: 'y' }],
  }
  assert.deepEqual(commentTarget(ledger, 'e1', 'y'), { type: 'expense', id: 'e1', label: 'Dinner' })
  assert.deepEqual(commentTarget(ledger, 'e2', 'y'), { type: 'expense', id: 'e2', label: 'Expense' })
  assert.deepEqual(commentTarget(ledger, 's1', 'y'), { type: 'settlement', id: 's1', label: 'Anna → You' })
  assert.equal(commentTarget(ledger, 'gone', 'y'), null)
  assert.equal(commentTarget({}, 'e1', 'y'), null)
})

test('groupDeleteCheck: the owner can delete only once nobody else is in the group', () => {
  const group = { id: 'g', owner_id: 'u1' }
  const me = { id: 'm1', user_id: 'u1', display_name: 'Me', role: 'owner' }
  const ana = { id: 'm2', user_id: 'u2', display_name: 'Ana' }
  // Someone who left (or deleted their account): the row stays for history only.
  const left = { id: 'm3', user_id: null, former_user_id: 'u3', display_name: 'Ben' }
  const gone = { id: 'm4', user_id: null, former_user_id: null, display_name: 'Former member' }

  // Alone → yes.
  assert.deepEqual(groupDeleteCheck(group, [me], 'u1'), { canDelete: true, others: [] })
  // A joined member still in it → no, and they're named.
  assert.deepEqual(groupDeleteCheck(group, [me, ana], 'u1'), { canDelete: false, others: [ana] })
  // People who already left don't hold it up (they can't be removed: their history stays).
  assert.deepEqual(groupDeleteCheck(group, [me, left, gone], 'u1'), { canDelete: true, others: [] })
  assert.deepEqual(groupDeleteCheck(group, [me, left, ana], 'u1').others, [ana])
  // Not the owner → no, even as the only one left.
  assert.equal(groupDeleteCheck(group, [ana], 'u2').canDelete, false)
  assert.equal(groupDeleteCheck({ owner_id: 'u2' }, [me], 'u1').canDelete, false)
  // Nothing loaded / signed out → no.
  assert.equal(groupDeleteCheck(null, [], 'u1').canDelete, false)
  assert.equal(groupDeleteCheck({ owner_id: null }, [], null).canDelete, false)
  assert.deepEqual(groupDeleteCheck(group, undefined, 'u1'), { canDelete: true, others: [] })
})

test('groupDeleteCheck mirrors delete_group: linked members other than the caller block it', () => {
  const sql = latestSql('delete_group')
  assert.match(sql, /m\.user_id is not null and m\.user_id <> uid/)
  assert.match(sql, /raise exception 'Remove the other members before deleting this group\.'/)
  assert.match(sql, /owner_id = uid/)
})
