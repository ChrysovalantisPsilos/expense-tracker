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
import {
  FIXTURES_DIR, budgetsFixture, insightsFixture, ledgerFixture, recurringFixture,
} from '../mobile-core/screenFigures.mjs'

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

test('ios budgets fixture: the committed file is what the web\'s functions give', () => {
  assert.deepEqual(committed('budgets'), fresh(budgetsFixture()))
})

test('ios budgets fixture: caps, spend, tones and the carried-over month', () => {
  const { own, carried } = committed('budgets').expected.en
  assert.equal(own.periodStart, '2020-09-01')
  assert.equal(own.subtitle, null)
  assert.equal(own.canCopy, true)
  const byName = Object.fromEntries(own.items.map((i) => [i.name, i]))
  assert.equal(byName.Groceries.meta, '€312.40 of €400.00')
  assert.equal(byName.Groceries.tone, null) // 78%: under the 80% warning
  // €22.81 abroad + €90.00 against a €100.00 cap: over.
  assert.equal(byName['Eating out'].over, true)
  // The yearly subscription counts its monthly share (€8.00).
  assert.equal(byName.Subscriptions.meta, '€8.00 of €20.00')
  assert.equal(carried.subtitle, 'Carried over from August')
  assert.equal(carried.canCopy, false)
})

test('ios recurring fixture: the committed file is what the web\'s functions give', () => {
  assert.deepEqual(committed('recurring'), fresh(recurringFixture()))
})

test('ios recurring fixture: groups, totals at today\'s rates, and the income tab', () => {
  const { groups, income } = committed('recurring').expected.en
  assert.deepEqual(groups.map((g) => g.key), ['weekly', 'monthly', 'yearly'])
  const monthly = groups.find((g) => g.key === 'monthly')
  assert.equal(monthly.total.converted, 'Other currencies converted at today’s rate.')
  assert.match(monthly.total.missing, /not included/)
  assert.equal(monthly.rows.find((r) => r.id === 'r3').hint, '≈ €8.99')
  assert.equal(groups.find((g) => g.key === 'weekly').rows[0].paused, 'Paused')
  // The savings rule is listed with the income but not summed as income.
  assert.equal(income.total.value, '≈ €2,500.00/month')
  assert.deepEqual(income.rows.map((r) => r.id), ['r7', 'r8'])
})

test('ios insights fixture: the committed file is what the web\'s functions give', () => {
  assert.deepEqual(committed('insights'), fresh(insightsFixture()))
})

test('ios insights fixture: the six months, the picked month\'s shares, this month\'s income', () => {
  const { thisMonth, august } = committed('insights').expected.en
  assert.equal(thisMonth.fetchFrom, '2020-04-01')
  assert.deepEqual(thisMonth.chart.map((m) => m.label), ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'])
  assert.equal(thisMonth.monthLabel, 'This month')
  assert.equal(august.monthLabel, 'August')
  assert.equal(august.bars.aside, 'Aug: €1,540.00')
  assert.equal(thisMonth.shares.reduce((s, c) => s + c.share, 0), 100)
  // The late-August salary counts in September.
  assert.equal(thisMonth.income.income, '€2,500.00')
})
