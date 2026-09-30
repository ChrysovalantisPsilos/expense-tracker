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
import { FIXTURE_FILE, FIXTURE_INPUT, homeFigures } from '../mobile-core/homeFigures.mjs'

const fixture = JSON.parse(readFileSync(resolve(FIXTURE_FILE), 'utf8'))

test('ios home fixture: the committed inputs are the script\'s', () => {
  assert.deepEqual(fixture.input, JSON.parse(JSON.stringify(FIXTURE_INPUT)))
})

test('ios home fixture: the committed figures are what the web\'s functions give', () => {
  assert.deepEqual(fixture.expected.en, homeFigures(fixture.input))
  assert.deepEqual(fixture.expected.el, homeFigures({ ...fixture.input, lang: 'el' }))
})

test('ios home fixture: the figures fold in the web\'s rules', () => {
  const f = fixture.expected.en
  // A shifted salary (25th) is fetched from late August and counts in September.
  assert.equal(f.fetchFrom, '2026-08-25')
  assert.equal(f.earnedTotal, 255000)
  // The savings entry is not income, and one taken from income lowers the net;
  // an expense paid from savings is spending that leaves the net alone.
  assert.equal(f.netTotal, 255000 - 31930 + 12000 - 30000)
  assert.equal(f.saved, '+€300.00 in · −€120.00 out')
  assert.equal(f.net, '+€2,050.70')
  assert.equal(f.netTone, 'positive')
  // A yearly subscription paid in March counts a twelfth; the group expense
  // ranks under its group; the shares sum to 100.
  assert.equal(f.bars.find((b) => b.name === 'Subscriptions').value, 800)
  assert.ok(f.bars.some((b) => b.name === 'Lisbon trip'))
  assert.equal(f.bars.reduce((s, b) => s + b.share, 0), 100)
  assert.equal(fixture.expected.el.bars[0].label, 'Χωρίς κατηγορία')
  assert.equal(fixture.expected.el.period.label, 'Αυτός ο μήνας')
})
