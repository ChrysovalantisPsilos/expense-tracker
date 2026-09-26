// Settings › Import rules (src/features/import/importRulesMath.js): the list's
// rows, search and direction filter, the editor's checks and category picker.
// Fake merchants only.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PATTERN_MAX, RULE_FILTERS, cleanPattern, directionLabel, filterRules, patternProblem, ruleRows, ruleTargets,
} from '../src/features/import/importRulesMath.js'
import { ruleCategory } from '../src/features/import/importMath.js'

const CATS = [
  { id: 'c-food', name: 'Groceries', kind: 'expense', icon: 'groceries', color: 'green', is_archived: false },
  { id: 'c-cafe', name: 'Café', kind: 'expense', icon: 'coffee', color: null, is_archived: false },
  { id: 'c-old', name: 'Old stuff', kind: 'expense', icon: null, color: null, is_archived: true },
  { id: 'c-pay', name: 'Salary', kind: 'income', icon: 'salary', color: null, is_archived: false },
]
const RULES = [
  { id: 'r1', pattern: 'ZZMART', category_id: 'c-food', created_at: '2026-09-02T10:00:00Z' },
  { id: 'r2', pattern: 'acme payroll', category_id: 'c-pay', created_at: '2026-08-15T09:30:00Z' },
  { id: 'r3', pattern: 'Brew Lab', category_id: 'c-cafe', created_at: '2026-09-20T12:00:00Z' },
]

test('ruleRows: category, direction and day added; sorted by text, case-blind', () => {
  const rows = ruleRows(RULES, CATS)
  assert.deepEqual(rows.map((r) => r.pattern), ['acme payroll', 'Brew Lab', 'ZZMART'])
  assert.deepEqual(rows.map((r) => r.kind), ['income', 'expense', 'expense'])
  assert.equal(rows[1].category.name, 'Café')
  assert.match(rows[0].addedOn, /^2026-08-1[45]$/) // the local day
  // A rule whose category can't be found (not loaded yet) has none.
  const [lost] = ruleRows([{ id: 'x', pattern: 'QQ', category_id: 'gone', created_at: null }], CATS)
  assert.equal(lost.category, null)
  assert.equal(lost.kind, null)
  assert.equal(lost.addedOn, null)
  assert.deepEqual(ruleRows(null, null), [])
})

test('filterRules: search the text or the category, accent- and case-blind; filter by direction', () => {
  const rows = ruleRows(RULES, CATS)
  const ids = (o) => filterRules(rows, o).map((r) => r.id)
  assert.deepEqual(ids({}), ['r2', 'r3', 'r1'])
  assert.deepEqual(ids({ query: 'zzm' }), ['r1'])
  assert.deepEqual(ids({ query: '  CAFE ' }), ['r3']) // category name, no accent typed
  assert.deepEqual(ids({ filter: 'income' }), ['r2'])
  assert.deepEqual(ids({ filter: 'expense', query: 'lab' }), ['r3'])
  assert.deepEqual(ids({ filter: 'income', query: 'lab' }), [])
  assert.deepEqual(RULE_FILTERS.map(([v]) => v), ['all', 'expense', 'income'])
  assert.equal(directionLabel('income'), 'Money in')
  assert.equal(directionLabel('expense'), 'Money out')
})

test('patternProblem / cleanPattern: the server bounds, and no second rule for the same text', () => {
  assert.equal(cleanPattern('  brew   lab \n'), 'brew lab')
  assert.equal(patternProblem('Z', RULES), 'Use at least 2 characters.')
  assert.equal(patternProblem('   ', RULES), 'Use at least 2 characters.')
  assert.equal(patternProblem('x'.repeat(PATTERN_MAX + 1), RULES), 'Use at most 80 characters.')
  assert.equal(patternProblem('x'.repeat(PATTERN_MAX), RULES), null)
  assert.equal(patternProblem('zzmart', RULES), 'You already have a rule for that text.')
  assert.equal(patternProblem(' BRÈW  LAB ', RULES), 'You already have a rule for that text.')
  // Its own text is fine (editing only the category).
  assert.equal(patternProblem('ZZMART', RULES, 'r1'), null)
  assert.equal(patternProblem('ZZMART CITY', RULES, 'r1'), null)
})

test('ruleTargets: active categories by direction, the current archived one kept', () => {
  const groups = ruleTargets(CATS)
  assert.deepEqual(groups.map((g) => [g.kind, g.label, g.categories.map((c) => c.id)]),
    [['expense', 'Money out', ['c-cafe', 'c-food']], ['income', 'Money in', ['c-pay']]])
  assert.deepEqual(ruleTargets(CATS, 'c-old')[0].categories.map((c) => c.id), ['c-cafe', 'c-food', 'c-old'])
  assert.deepEqual(ruleTargets(CATS.filter((c) => c.kind === 'expense')).map((g) => g.kind), ['expense'])
})

test('an edited rule files the next import by its new text and category (ruleCategory)', () => {
  const kindOf = new Map(CATS.map((c) => [c.id, c.kind]))
  const edited = [{ pattern: cleanPattern('  brew lab  '), category_id: 'c-food' }]
  assert.equal(ruleCategory(edited, kindOf, 'PAYMENT VIA BANCONTACT BREW LAB GENT', 'expense'), 'c-food')
  // Its direction is its category's: it never files money in.
  assert.equal(ruleCategory(edited, kindOf, 'BREW LAB REFUND', 'income'), null)
})
