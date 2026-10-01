// The native app's import parity fixture (mobile-core/importFigures.mjs):
// the committed ios/Budgeer/BudgeerTests/Fixtures/import.json must be what
// the web's functions give today; the Swift ImportParityTests must get the
// same through the core. After a change that moves a word or a row,
// regenerate it (npm run ios:fixture).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { FIXTURES_DIR } from '../mobile-core/screenFigures.mjs'
import { importFixture } from '../mobile-core/importFigures.mjs'

const committed = JSON.parse(readFileSync(resolve(FIXTURES_DIR, 'import.json'), 'utf8'))

test('ios import fixture: the committed file is what the web\'s functions give', () => {
  assert.deepEqual(committed, JSON.parse(JSON.stringify(importFixture())))
})

test('ios import fixture: the walk covers a rule, a review choice, a known row and an unreadable one', () => {
  const { en, el } = committed.expected
  assert.equal(en.preview[0].meta, '1 Sep · Groceries')
  assert.equal(en.preview[3].amount, '+€2,500.00')
  assert.deepEqual(en.merchants.map((m) => m.id), ['expense|CAFE ROMA', 'income|ACME PAYROLL'])
  assert.deepEqual(en.rules, [{ pattern: 'CAFE ROMA', category_id: '44444444-4444-4444-8444-444444444444' }])
  // One of the two coffees is already in the ledger: three rows are saved.
  assert.equal(en.saved.length, 3)
  assert.equal(en.done.title, 'Imported 3 transactions')
  // The ids are the language's no matter: the same rows in Greek.
  assert.deepEqual(el.saved, en.saved)
  assert.notEqual(el.detection, en.detection)
})
