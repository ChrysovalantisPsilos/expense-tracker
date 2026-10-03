// The native app's category page parity fixture (mobile-core/categoryFigures.mjs):
// the committed ios/Budgeer/BudgeerTests/Fixtures/category.json holds what the
// web's CategoryPage functions give for its inputs, and the Swift test
// (CategoryPageTests) must get the same through the core. This keeps the
// committed file equal to what the web gives today (npm run ios:fixture).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { FIXTURE_FILE, categoryFixture } from '../mobile-core/categoryFigures.mjs'

const committed = JSON.parse(readFileSync(resolve(FIXTURE_FILE), 'utf8'))

test('ios category fixture: the committed file is what the web\'s functions give', () => {
  assert.deepEqual(committed, JSON.parse(JSON.stringify(categoryFixture())))
})

test('ios category fixture: the page folds in the web\'s rules', () => {
  const { en } = committed.expected
  // $25.00 at 0.9123 counts €22.81: €42.50 + €18.99 + €22.81, and €15.00 paid
  // on 30 Aug, after the payday that opened September.
  assert.equal(en.groceries.total, '€99.30')
  assert.equal(en.groceries.budgetMonth, '2020-09-01')
  assert.equal(en.groceries.budget.carried, 'Carried over from August')
  assert.equal(en.groceries.budgetInput, '100.00')
  assert.equal(en.pastMonth.canEditBudget, false)
  assert.equal(en.year.budget.state, 'monthly')
  assert.equal(en.salary.budget, null)
  assert.equal(en.savings.totalLabel, 'Saved')
  // A group's share buckets under its group, not "Uncategorized".
  assert.deepEqual(en.none.rows.map((r) => r.id), ['n1'])
  assert.equal(en.archived.eyebrow, 'Archived category')
  assert.equal(en.missing.found, false)
})
