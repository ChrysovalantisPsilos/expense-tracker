// The native app's Groups parity fixture (mobile-core/groupFigures.mjs): the
// committed ios/Budgeer/BudgeerTests/Fixtures/groups.json holds what the
// web's functions give for its inputs, and the Swift parity tests must get
// the same through the core. This keeps the committed file equal to what
// the web gives today: after a change that moves a figure or a word,
// regenerate it (npm run ios:fixture).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { FIXTURES_DIR, groupsFixture } from '../mobile-core/groupFigures.mjs'

// The activity log's times are local ("12 Sep, 18:30"): the fixture is
// written in UTC (npm run ios:fixture) and the Swift tests run in UTC, so
// this file compares in UTC whatever zone the suite runs in.
process.env.TZ = 'UTC'

const committed = () => JSON.parse(readFileSync(resolve(FIXTURES_DIR, 'groups.json'), 'utf8'))

test('ios groups fixture: the committed file is what the web\'s functions give', () => {
  assert.deepEqual(committed(), JSON.parse(JSON.stringify(groupsFixture())))
})

test('ios groups fixture: the list, a page seen by its owner and by a member, the forms, settle up', () => {
  const { list, owner, member, forms, settleOwed, settlePay } = committed().expected.en
  assert.deepEqual(list.cards.map((c) => c.balance), [
    { label: 'You’re owed', amount: '€162.75', tone: 'positive' },
    { label: 'You owe', amount: '£12.50', tone: 'negative' },
  ])
  assert.equal(list.invites[0].text, 'Marco Rossi invited you')
  assert.equal(owner.total, '€299.72')
  assert.equal(owner.balances.highlight.text, '3 people owe you')
  assert.equal(owner.expenses[1].amountMeta, '≈ €49.72')
  assert.equal(owner.canDelete, false)
  assert.equal(owner.stillIn, 'Sofia, Marco Rossi')
  assert.equal(member.isOwner, false)
  assert.deepEqual(member.expenses.map((e) => e.canEdit), [false, true, false])
  assert.equal(member.balances.highlight.text, 'You owe Alex Morgan')
  assert.equal(forms.new.card.line, 'All 4 · €21.15 each')
  assert.equal(forms.quick.toast.title, 'Added to Lisbon trip')
  assert.deepEqual(forms.exactShort.problem, { title: 'Amounts must add up to the total', description: 'Missing €7.50' })
  assert.deepEqual(forms.editPercent.start.values, { m1: '33.34', m2: '33.33', m3: '33.33' })
  assert.equal(settleOwed.suggestions[0].text, '<b>Sofia</b> pays you €89.25')
  assert.deepEqual(settlePay.args, {
    groupId: 'g-lisbon', fromMember: 'm2', toMember: 'm1', amountMinor: 8925, currency: 'EUR', settledAt: '2026-09-20',
  })
})
