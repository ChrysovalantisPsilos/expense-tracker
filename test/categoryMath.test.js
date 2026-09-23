import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  CATEGORY_NAME_MAX, categoryNameError, sortCategories, moveTargets,
} from '../src/features/categories/categoryMath.js'
import {
  CATEGORY_ICON_KEYS, CATEGORY_COLOR_KEYS, CATEGORY_COLORS, categoryTile,
} from '../src/shared/lib/categoryStyle.js'

test('categoryNameError mirrors the server rule: 1–60 chars trimmed, no control chars', () => {
  assert.equal(CATEGORY_NAME_MAX, 60)
  assert.equal(categoryNameError('Pets'), null)
  assert.equal(categoryNameError('  Pets  '), null)
  assert.equal(categoryNameError('x'.repeat(60)), null)
  assert.match(categoryNameError('x'.repeat(61)), /60 characters/)
  assert.match(categoryNameError('   '), /name/)
  assert.match(categoryNameError(''), /name/)
  assert.match(categoryNameError(null), /name/)
  assert.match(categoryNameError('Bad\nname'), /letters/)
  assert.match(categoryNameError('Tab\there'), /letters/)
  // Counted in characters, not UTF-16 units: 60 emoji fit.
  assert.equal(categoryNameError('🍕'.repeat(60)), null)
})

test('categoryNameError rejects a duplicate of the same kind, ignoring case', () => {
  const others = [{ name: 'Food & Dining' }, { name: ' Travel ' }]
  assert.match(categoryNameError('food & dining', others), /already have/)
  assert.match(categoryNameError('TRAVEL', others), /already have/)
  assert.equal(categoryNameError('Travel & trips', others), null)
})

const cats = [
  { id: 1, name: 'groceries', kind: 'expense' },
  { id: 2, name: 'Zoo', kind: 'expense', is_archived: true },
  { id: 3, name: 'Aardvark', kind: 'expense', is_archived: true },
  { id: 4, name: 'Salary', kind: 'income' },
  { id: 5, name: 'Bills', kind: 'expense' },
]

test('sortCategories: one kind, active A–Z then archived A–Z', () => {
  assert.deepEqual(sortCategories(cats, 'expense').map((c) => c.id), [5, 1, 3, 2])
  assert.deepEqual(sortCategories(cats, 'income').map((c) => c.id), [4])
  assert.deepEqual(sortCategories(null, 'expense'), [])
})

test('moveTargets: other active categories of the same kind', () => {
  assert.deepEqual(moveTargets(cats, cats[0]).map((c) => c.id), [5])
  assert.deepEqual(moveTargets(cats, cats[3]).map((c) => c.id), [])
})

test('categoryTile: a known colour key tints the tile; anything else keeps the default', () => {
  assert.deepEqual(categoryTile('teal'), { fg: CATEGORY_COLORS.teal, bg: `${CATEGORY_COLORS.teal}29` })
  assert.equal(categoryTile(null), null)
  assert.equal(categoryTile('#ff0000'), null)
  for (const hex of Object.values(CATEGORY_COLORS)) assert.match(hex, /^#[0-9A-F]{6}$/)
})

// The icon and colour keys are CHECK constraints on the server (0060) and
// Lucide mappings in icons.jsx — all three lists must stay identical.
const sqlList = (sql, column) => {
  const m = sql.match(new RegExp(`${column} is null or ${column} in \\(([^)]*)\\)`))
  return m[1].match(/'([a-z-]+)'/g).map((s) => s.slice(1, -1))
}

test('icon/colour keys match the 0060 CHECK constraints and the icon registry', () => {
  const sql = readFileSync(new URL('../supabase/migrations/0060_category_management.sql', import.meta.url), 'utf8')
  assert.deepEqual(sqlList(sql, 'icon'), CATEGORY_ICON_KEYS)
  assert.deepEqual(sqlList(sql, 'color'), CATEGORY_COLOR_KEYS)
  const icons = readFileSync(new URL('../src/shared/lib/icons.jsx', import.meta.url), 'utf8')
  const registry = icons.slice(icons.indexOf('const CATEGORY_ICONS = {'), icons.indexOf('}', icons.indexOf('const CATEGORY_ICONS = {')))
  assert.deepEqual([...registry.matchAll(/^\s+([a-z-]+):/gm)].map((m) => m[1]), CATEGORY_ICON_KEYS)
})
