// The native app's screen parity fixtures (mobile-core/screenFigures.mjs):
// each committed ios/Budgeer/BudgeerTests/Fixtures/<screen>.json holds what
// the web's functions give for its inputs, and the Swift parity tests must
// get the same through the core. This keeps the committed files equal to
// what the web gives today: after a change that moves a figure or a word,
// regenerate them (npm run ios:fixture).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { FIXTURES_DIR, ledgerFixture } from '../mobile-core/screenFigures.mjs'

const committed = (name) => JSON.parse(readFileSync(resolve(FIXTURES_DIR, `${name}.json`), 'utf8'))
const fresh = (value) => JSON.parse(JSON.stringify(value))

test('ios ledger fixture: the committed file is what the web\'s functions give', () => {
  assert.deepEqual(committed('ledger'), fresh(ledgerFixture()))
})

test('ios ledger fixture: the list folds in the web\'s rules', () => {
  const { en } = committed('ledger').expected
  assert.equal(en.search.subtitle, '1 result · Net −€12.99')
  const all = Object.fromEntries(en.all.rows.map((r) => [r.id, r]))
  assert.equal(all.a4.approx, '≈ €22.81')
  assert.equal(all.a5.group, 'Lisbon trip')
  assert.equal(all.a6.repeats, 'Repeats every month')
  assert.equal(all.a9.spread, '€8.00/month over 12 months')
  assert.equal(all.b1.countsFor, 'Counts for September')
  assert.equal(all.b1.amount, '+€2,500.00')
})
