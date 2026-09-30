// The native app's Home parity fixture (mobile-core/homeFigures.mjs): the
// committed ios/Budgeer/BudgeerTests/Fixtures/home.json holds the figures the
// web's Dashboard functions give for its inputs, and the Swift test
// (HomeParityTests) must get the same through the core. This keeps the
// committed file equal to what the web's functions give today: when a maths
// change moves a figure, regenerate it (npm run ios:fixture).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { FIXTURE_FILE, FIXTURE_INPUT, homeFixtureExpected } from '../mobile-core/homeFigures.mjs'

const fixture = JSON.parse(readFileSync(resolve(FIXTURE_FILE), 'utf8'))

test('ios home fixture: the committed inputs are the script\'s', () => {
  assert.deepEqual(fixture.input, JSON.parse(JSON.stringify(FIXTURE_INPUT)))
})

test('ios home fixture: the committed figures are what the web\'s functions give', () => {
  assert.deepEqual(fixture.expected, JSON.parse(JSON.stringify(homeFixtureExpected())))
})

test('ios home fixture: the figures fold in the web\'s rules', () => {
  const f = fixture.expected.en.thisMonth
  // A shifted salary (25th) is fetched from late August and counts in September.
  assert.equal(f.fetchFrom, '2020-08-25')
  assert.equal(f.earnedTotal, 255000)
  // What's logged (€319.30) plus the rules still to come this month: €12.99
  // on the 20th and $9.99 at today's 0.9 on the 25th.
  assert.equal(f.spentTotal, 31930 + 1299 + 899)
  // The savings entry is not income, and one taken from income lowers the net;
  // an expense paid from savings is spending that leaves the net alone.
  assert.equal(f.netTotal, 255000 - (31930 + 1299 + 899) + 12000 - 30000)
  assert.equal(f.saved, '+€300.00 in · −€120.00 out')
  assert.equal(f.netTone, 'positive')
  // A yearly subscription paid in March counts a twelfth; the group expense
  // ranks under its group; the shares sum to 100.
  assert.equal(f.bars.find((b) => b.name === 'Subscriptions').value, 800)
  assert.ok(f.bars.some((b) => b.name === 'Lisbon trip'))
  assert.equal(f.bars.reduce((s, b) => s + b.share, 0), 100)
  assert.equal(fixture.expected.el.thisMonth.bars[0].label, 'Χωρίς κατηγορία')
  assert.equal(fixture.expected.el.thisMonth.period.label, 'Αυτός ο μήνας')
})

test('ios home fixture: the Recurring card, upcoming this month and charged in a past one', () => {
  const now = fixture.expected.en.thisMonth.recurring
  assert.equal(now.upcoming, true)
  // The paused weekly rule has nothing to come, so there's no Weekly tab.
  assert.deepEqual(now.groups.map((g) => g.key), ['monthly', 'yearly'])
  const monthly = now.groups[0]
  assert.deepEqual(monthly.rows.map((r) => r.id), ['r1', 'r2', 'r3'])
  assert.equal(monthly.rows[1].hint, '≈ €8.99')
  assert.equal(monthly.headline.converted, 'Other currencies converted at today’s rate.')
  assert.equal(now.groups[1].note, 'Each counts in your monthly spending a twelfth at a time.')
  const past = fixture.expected.en.august
  assert.equal(past.period.label, 'August 2020')
  assert.equal(past.recurring.upcoming, false)
  assert.equal(past.recurring.subtitle, 'Charged in August 2020')
  assert.deepEqual(past.recurring.groups[0].rows.map((r) => r.id), ['c1'])
})
