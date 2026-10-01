// The group expense form's rules (groupExpenseForm.js) and the settle-up
// page's (settleForm.js), shared by the web's forms and the native app.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  expenseFieldErrors, expenseFormStart, expenseSaveArgs, expenseSaveProblem, expenseSavedToast, includedIds, includedMembers,
  initialSplitMode, paidMinorOf, shareUnit, splitCardParts, splitModes, splitPreview, splitTotal,
} from '../src/features/groups/groupExpenseForm.js'
import {
  payShortcutParts, settleFormStart, settleOtherLine, settleOthers, settleParties, settleProblem,
  settleSuggestionParts, settlementArgs,
} from '../src/features/groups/settleForm.js'

const MEMBERS = [
  { id: 'm1', user_id: 'u1', display_name: 'Alex' },
  { id: 'm2', user_id: 'u2', display_name: 'Sofia' },
  { id: 'm3', user_id: null, display_name: 'Anna' },
]

test('expenseFormStart: a new expense, one carried over from Add, and an edited one', () => {
  const fresh = expenseFormStart({ members: MEMBERS, defaultPayer: 'm2', groupCurrency: 'EUR', today: '2026-09-20' })
  assert.deepEqual(fresh, {
    description: '', paidCurrency: 'EUR', currencyPicked: false, amount: '', paidBy: 'm2', spentAt: '2026-09-20',
    splitWith: ['m1', 'm2', 'm3'], mode: 'equal', values: {},
  })
  const carried = expenseFormStart({
    members: MEMBERS, groupCurrency: 'EUR', today: '2026-09-20',
    initial: { amount: '12.50', currency: 'USD', currencyPicked: true, description: 'Taxi', spentAt: '2026-09-18' },
  })
  assert.deepEqual([carried.amount, carried.paidCurrency, carried.currencyPicked, carried.description, carried.spentAt, carried.paidBy],
    ['12.50', 'USD', true, 'Taxi', '2026-09-18', 'm1'])
  const expense = {
    description: 'Dinner', currency: 'EUR', amount_minor: 3000, group_amount_minor: 3000, paid_by: 'm1', spent_at: '2026-09-08',
    split_type: 'exact', expense_splits: [{ member_id: 'm1', share_minor: 1000 }, { member_id: 'm2', share_minor: 2000 }],
  }
  const edit = expenseFormStart({ expense, members: MEMBERS, defaultPayer: 'm2', groupCurrency: 'EUR', today: '2026-09-20' })
  assert.deepEqual([edit.amount, edit.paidBy, edit.splitWith, edit.mode, edit.values],
    ['30.00', 'm1', ['m1', 'm2'], 'exact', { m1: '10.00', m2: '20.00' }])
  assert.equal(initialSplitMode({ split_type: 'items' }), 'exact')
  assert.equal(initialSplitMode(null), 'equal')
})

test('expenseFieldErrors / includedIds / paidMinorOf / splitTotal', () => {
  assert.deepEqual(Object.keys(expenseFieldErrors({ description: '', amount: '', paidBy: '' })), ['description', 'amount', 'paidBy'])
  assert.equal(expenseFieldErrors({ description: '', amount: '1', paidBy: 'm1' }).description, 'Add a description')
  assert.deepEqual(expenseFieldErrors({ description: 'x', amount: '1', paidBy: 'm1' }), {})
  assert.deepEqual(includedIds(MEMBERS, ['m3', 'm1']), ['m1', 'm3'])
  assert.deepEqual(includedMembers(MEMBERS, ['m2']), [MEMBERS[1]])
  assert.equal(paidMinorOf('12.5', 'EUR'), 1250)
  assert.equal(paidMinorOf('', 'EUR'), 0)
  assert.equal(splitTotal({ paidMinor: 1000, paidCurrency: 'USD', rate: 0.9, groupCurrency: 'EUR' }), 900)
  assert.equal(splitTotal({ paidMinor: 1000, paidCurrency: 'USD', rate: null, groupCurrency: 'EUR' }), 0)
})

test('splitPreview: the shares, the line under the split and whether it\'s complete', () => {
  const ids = ['m1', 'm2', 'm3']
  const base = { totalMinor: 1000, ids, currency: 'EUR', needsFx: false, paidMinor: 1000, rate: 1 }
  const equal = splitPreview({ ...base, mode: 'equal', values: {} })
  assert.deepEqual(equal.byMember, { m1: 334, m2: 333, m3: 333 })
  assert.deepEqual([equal.summary, equal.complete, equal.shareText.m1], ['€3.34 each', true, '€3.34'])
  const exact = splitPreview({ ...base, mode: 'exact', values: { m1: '2', m2: '3' } })
  assert.deepEqual([exact.remaining, exact.summary, exact.complete], [500, '€5.00 left to assign', false])
  assert.equal(splitPreview({ ...base, mode: 'exact', values: { m1: '7', m2: '4' } }).summary, '€1.00 over the total')
  assert.equal(splitPreview({ ...base, mode: 'exact', values: { m1: '5', m2: '5' } }).summary, 'Adds up to the total ✓')
  assert.equal(splitPreview({ ...base, mode: 'percent', values: { m1: '50', m2: '20' } }).summary, '70% of 100% assigned')
  assert.equal(splitPreview({ ...base, mode: 'percent', values: { m1: '50', m2: '50' } }).summary, 'Adds up to 100% ✓')
  assert.equal(splitPreview({ ...base, mode: 'shares', values: {} }).summary, 'Give someone a share')
  assert.equal(splitPreview({ ...base, mode: 'shares', values: { m1: '2' } }).summary, 'Split by shares')
  assert.equal(splitPreview({ ...base, ids: [], mode: 'equal' }).summary, 'Pick at least one person.')
  assert.equal(splitPreview({ ...base, totalMinor: 0, needsFx: true, rate: null, mode: 'equal' }).summary, 'The split needs the exchange rate.')
  assert.equal(splitPreview({ ...base, totalMinor: 0, paidMinor: 0, mode: 'equal' }).summary, 'Enter an amount to see the split.')
  assert.deepEqual(splitModes(), ['equal', 'exact', 'percent', 'shares'])
  assert.deepEqual([shareUnit('percent', 'EUR'), shareUnit('shares', 'EUR'), shareUnit('exact', 'EUR')], ['%', '×', 'EUR'])
  assert.deepEqual(splitCardParts({ mode: 'equal', included: 3, total: 3, summary: '€3.34 each' }),
    { title: 'Split equally', line: 'All 3 · €3.34 each' })
  assert.equal(splitCardParts({ mode: 'exact', included: 2, total: 3, summary: 'x' }).line, '2 of 3 · x')
})

test('expenseSaveProblem / expenseSaveArgs / expenseSavedToast: what a save checks, sends and says', () => {
  const ids = ['m1', 'm2']
  const preview = splitPreview({ mode: 'exact', totalMinor: 1000, ids, values: { m1: '4' }, currency: 'EUR', paidMinor: 1000, rate: 1 })
  const check = { rate: 1, fxLoading: false, ids, mode: 'exact', preview, totalMinor: 1000, currency: 'EUR' }
  assert.deepEqual(expenseSaveProblem(check), { title: 'Amounts must add up to the total', description: 'Missing €6.00' })
  assert.deepEqual(expenseSaveProblem({ ...check, rate: null, fxLoading: true }), { title: 'Still fetching the exchange rate…' })
  assert.deepEqual(expenseSaveProblem({ ...check, rate: null }), { title: 'Enter the exchange rate' })
  assert.deepEqual(expenseSaveProblem({ ...check, ids: [] }), { title: 'Split between at least one person' })
  assert.deepEqual(expenseSaveProblem({ ...check, mode: 'percent', preview: { ok: false } }), { title: 'Percentages must add up to 100%' })
  assert.deepEqual(expenseSaveProblem({ ...check, mode: 'shares', preview: { ok: false } }), { title: 'Give at least one person a share' })
  assert.equal(expenseSaveProblem({ ...check, mode: 'equal' }), null)
  const args = expenseSaveArgs({
    groupId: 'g1', description: 'Taxi', paidMinor: 1100, paidCurrency: 'USD', needsFx: true, rate: 0.9,
    paidBy: 'm1', spentAt: '2026-09-20', ids, mode: 'exact', preview,
  })
  assert.deepEqual(args, {
    groupId: 'g1', description: 'Taxi', amountMinor: 1100, currency: 'USD', exchangeRate: 0.9, paidBy: 'm1',
    spentAt: '2026-09-20', memberIds: ids, shares: [400, 0], splitType: 'exact',
  })
  const edit = expenseSaveArgs({ ...args, expenseId: 'e1', paidMinor: 1100, paidCurrency: 'EUR', needsFx: false, ids, mode: 'equal', preview })
  assert.deepEqual([edit.expenseId, edit.groupId, edit.exchangeRate, edit.shares], ['e1', undefined, null, null])
  assert.deepEqual(expenseSavedToast({ isEdit: true }), { title: 'Expense updated' })
  assert.deepEqual(expenseSavedToast({ quick: false }), { title: 'Expense added' })
  assert.deepEqual(expenseSavedToast({ quick: true, groupName: 'Lisbon', myShare: 550, currency: 'EUR' }),
    { title: 'Added to Lisbon', description: 'Your share, €5.50, is in your expenses.' })
  assert.equal(expenseSavedToast({ quick: true, groupName: 'Lisbon', myShare: 0, currency: 'EUR' }).description,
    'It isn’t split with you, so nothing goes in your expenses.')
})

test('settleFormStart / settleSuggestionParts: the form opens on your biggest payment', () => {
  const balances = new Map([['m1', 3000], ['m2', -1000], ['m3', -2000]])
  assert.deepEqual(settleOthers(MEMBERS, 'm2').map((m) => m.id), ['m1', 'm3'])
  assert.deepEqual(settleFormStart({ balances, members: MEMBERS, myMemberId: 'm1', currency: 'EUR', today: '2026-09-20' }),
    { direction: 'in', otherId: 'm3', amount: '20.00', settledAt: '2026-09-20', picked: 0 })
  assert.deepEqual(settleFormStart({ balances: new Map(), members: MEMBERS, myMemberId: 'm2', currency: 'EUR', today: '2026-09-20' }),
    { direction: 'out', otherId: 'm1', amount: '', settledAt: '2026-09-20', picked: -1 })
  const owed = settleSuggestionParts({ balances, members: MEMBERS, myMemberId: 'm1', currency: 'EUR' })
  assert.deepEqual(owed.map((s) => [s.index, s.direction, s.otherId, s.amount, s.text, s.remind?.label ?? null]), [
    [0, 'in', 'm3', '20.00', '<b>Anna</b> pays you €20.00', null],
    [1, 'in', 'm2', '10.00', '<b>Sofia</b> pays you €10.00', 'Remind Sofia to settle'],
  ])
  assert.deepEqual(owed[1].remind.memberId, 'm2')
  const paying = settleSuggestionParts({ balances, members: MEMBERS, myMemberId: 'm2', currency: 'EUR' })
  assert.deepEqual([paying[0].key, paying[0].values, paying[0].text, paying[0].remind],
    ['groups:settle.payOut', { name: 'Alex', amount: '€10.00' }, 'Pay <b>Alex</b> €10.00', null])
})

test('settleOtherLine / settleParties / settleProblem / settlementArgs', () => {
  const balances = new Map([['m1', 3000], ['m2', -1000]])
  const line = (otherId) => settleOtherLine({ balances, members: MEMBERS, otherId, currency: 'EUR' })
  assert.deepEqual([line('m1'), line('m2'), line('m3'), line('')],
    ['Alex is owed €30.00 overall', 'Sofia owes €10.00 overall', 'Anna is settled up', null])
  assert.deepEqual(settleParties({ direction: 'out', members: MEMBERS, otherId: 'm1' }), { from: 'You', to: 'Alex' })
  assert.deepEqual(settleParties({ direction: 'in', members: MEMBERS, otherId: '' }), { from: '—', to: 'You' })
  assert.equal(settleProblem({ otherId: '', amount: '5' }), 'Pick a person')
  assert.equal(settleProblem({ otherId: 'm1', amount: '0' }), 'Enter an amount')
  assert.equal(settleProblem({ otherId: 'm1', amount: '5' }), null)
  assert.deepEqual(settlementArgs({ groupId: 'g1', direction: 'in', myMemberId: 'm2', otherId: 'm1', amount: '12.5', currency: 'EUR', settledAt: '2026-09-20' }),
    { groupId: 'g1', fromMember: 'm1', toMember: 'm2', amountMinor: 1250, currency: 'EUR', settledAt: '2026-09-20' })
})

test('payShortcutParts: the links, the bank QR for EUR, or what the box would offer', () => {
  const member = MEMBERS[1]
  assert.deepEqual(payShortcutParts({ member: null }), { kind: 'hidden' })
  assert.deepEqual(payShortcutParts({ member, info: null, amountMinor: 1250, currency: 'EUR' }), { kind: 'hidden' })
  assert.equal(payShortcutParts({ member, info: {}, amountMinor: 1250, currency: 'EUR' }).kind, 'hint')
  assert.match(payShortcutParts({ member: MEMBERS[2], info: null, amountMinor: 1250, currency: 'EUR' }).note, /^Once Anna joins/)
  const info = { payment_iban: 'BE71096123456769', payment_revolut: '@sofia', payment_paypal: 'SofiaP' }
  const links = payShortcutParts({ member, info, amountMinor: 1250, currency: 'EUR', groupName: 'Lisbon' })
  assert.equal(links.kind, 'links')
  assert.equal(links.title, 'Pay Sofia directly')
  assert.equal(links.revolut, 'https://revolut.me/sofia?currency=EUR&amount=1250')
  assert.equal(links.paypal, 'https://paypal.me/SofiaP/12.50EUR')
  assert.match(links.qr, /^BCD\n002\n1\nSCT\n\nSofia\nBE71096123456769\nEUR12.50/)
  assert.equal(links.qrCaption, 'Scan with your banking app — payee and 12.50 EUR are pre-filled.')
  assert.equal(payShortcutParts({ member, info, amountMinor: 1250, currency: 'USD' }).qr, null)
})
