import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  CATEGORY_NAME_MAX, categoryNameError, sortCategories, moveTargets, sameKindOthers,
  categoryPatch, categoryPeriod,
} from '../src/features/categories/categoryMath.js'
import { NO_CATEGORY } from '../src/features/transactions/txnFilter.js'
import {
  CATEGORY_ICON_KEYS, CATEGORY_ICON_LABELS, CATEGORY_ICON_GROUPS, CATEGORY_COLOR_KEYS,
  CATEGORY_COLORS, categoryTile, categoryIconKey,
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

test('sameKindOthers: same kind, archived included, without the one edited', () => {
  assert.deepEqual(sameKindOthers(cats, cats[0]).map((c) => c.id), [2, 3, 5])
  assert.deepEqual(sameKindOthers(cats, { kind: 'income' }).map((c) => c.id), [4]) // a new one
  assert.deepEqual(sameKindOthers(null, cats[0]), [])
})

test('categoryPatch: only what changed; the name compares trimmed', () => {
  const c = { id: 1, name: 'Pets', icon: 'other', color: null }
  assert.equal(categoryPatch(c, { name: ' Pets ', icon: 'other', color: null }), null)
  assert.deepEqual(categoryPatch(c, { name: 'Pet care', icon: 'other', color: null }), { name: 'Pet care' })
  assert.deepEqual(categoryPatch(c, { name: 'Pets', icon: 'gifts', color: 'teal' }), { icon: 'gifts', color: 'teal' })
  // A legacy row with no stored icon gets the one the form showed.
  assert.deepEqual(categoryPatch({ ...c, icon: undefined }, { name: 'Pets', icon: 'other', color: null }), { icon: 'other' })
})

test('categoryPeriod: lists real payments, totals spread parts in base currency', () => {
  const CAT = 'c1'
  const row = (o) => ({
    id: Math.random(), kind: 'expense', category_id: CAT, amount_minor: 1000, exchange_rate: 1,
    currency: 'EUR', spent_at: '2026-09-10', spread_months: null, ...o,
  })
  const rows = [
    row({ id: 'a' }),
    row({ id: 'usd', amount_minor: 2000, currency: 'USD', exchange_rate: 0.5 }), // €10.00
    row({ id: 'year', amount_minor: 12000, spent_at: '2026-07-05', spread_months: 12 }), // paid in July
    row({ id: 'other', category_id: 'c2' }),
    row({ id: 'aug', spent_at: '2026-08-31' }),
  ]
  const sep = { categoryId: CAT, from: '2026-09-01', to: '2026-09-30', baseCurrency: 'EUR' }
  const p = categoryPeriod(rows, sep)
  assert.deepEqual(p.listed.map((r) => r.id), ['a', 'usd'])
  assert.equal(p.total, 1000 + 1000 + 1000) // + the yearly's September twelfth
  // Kept separate: the yearly subscription doesn't count at all.
  assert.equal(categoryPeriod(rows, { ...sep, separateYearly: true }).total, 2000)
  // All time: every payment, the yearly in full.
  const all = categoryPeriod(rows, { ...sep, from: null, to: null })
  assert.equal(all.listed.length, 4)
  assert.equal(all.total, 1000 + 1000 + 12000 + 1000)
})

test('categoryPeriod: Uncategorized keeps personal rows without a category', () => {
  const rows = [
    { id: 'u', kind: 'expense', category_id: null, amount_minor: 500, exchange_rate: 1, currency: 'EUR', spent_at: '2026-09-02' },
    { id: 'g', kind: 'expense', category_id: null, group_expense_id: 'ge', amount_minor: 700, exchange_rate: 1, currency: 'EUR', spent_at: '2026-09-02' },
    { id: 'c', kind: 'expense', category_id: 'c1', amount_minor: 900, exchange_rate: 1, currency: 'EUR', spent_at: '2026-09-02' },
  ]
  const p = categoryPeriod(rows, { categoryId: NO_CATEGORY, from: '2026-09-01', to: '2026-09-30', baseCurrency: 'EUR' })
  assert.deepEqual(p.listed.map((r) => r.id), ['u'])
  assert.equal(p.total, 500)
  assert.deepEqual(categoryPeriod(null, { categoryId: 'c1', from: null, to: null, baseCurrency: 'EUR' }),
    { listed: [], total: 0 })
})

test('categoryTile: a known colour key tints the tile; anything else keeps the default', () => {
  assert.deepEqual(categoryTile('teal'), { fg: CATEGORY_COLORS.teal, bg: `${CATEGORY_COLORS.teal}29` })
  assert.equal(categoryTile(null), null)
  assert.equal(categoryTile('#ff0000'), null)
  for (const hex of Object.values(CATEGORY_COLORS)) assert.match(hex, /^#[0-9A-F]{6}$/)
})

// The icon and colour keys are CHECK constraints on the server (colours: 0060;
// icons: the latest widening, 0071) and Lucide mappings in icons.jsx — all
// three lists must stay identical.
const sqlList = (sql, column) => {
  const m = sql.match(new RegExp(`${column} is null or ${column} in \\(([^)]*)\\)`))
  return m[1].match(/'([a-z-]+)'/g).map((s) => s.slice(1, -1))
}

test('icon/colour keys match the CHECK constraints and the icon registry', () => {
  const sql = readFileSync(new URL('../supabase/migrations/0060_category_management.sql', import.meta.url), 'utf8')
  const iconSql = readFileSync(new URL('../supabase/migrations/0071_more_category_icons.sql', import.meta.url), 'utf8')
  assert.deepEqual(sqlList(iconSql, 'icon'), CATEGORY_ICON_KEYS)
  assert.deepEqual(sqlList(sql, 'color'), CATEGORY_COLOR_KEYS)
  const icons = readFileSync(new URL('../src/shared/lib/icons.jsx', import.meta.url), 'utf8')
  const registry = icons.slice(icons.indexOf('const CATEGORY_ICONS = {'), icons.indexOf('}', icons.indexOf('const CATEGORY_ICONS = {')))
  assert.deepEqual([...registry.matchAll(/^\s+'?([a-z-]+)'?:/gm)].map((m) => m[1]), CATEGORY_ICON_KEYS)
})

test('icon picker: every key has a label and sits in exactly one group', () => {
  const grouped = CATEGORY_ICON_GROUPS.flatMap((g) => g.keys)
  assert.deepEqual([...grouped].sort(), [...CATEGORY_ICON_KEYS].sort())
  assert.equal(new Set(grouped).size, grouped.length)
  assert.deepEqual(Object.keys(CATEGORY_ICON_LABELS).sort(), [...CATEGORY_ICON_KEYS].sort())
  assert.equal(new Set(CATEGORY_ICON_KEYS).size, CATEGORY_ICON_KEYS.length)
})

test('categoryIconKey: a stored key wins, else the name suggests one, else other', () => {
  assert.equal(categoryIconKey({ icon: 'parking', name: 'Groceries' }), 'parking')
  assert.equal(categoryIconKey({ icon: '🍕', name: 'Groceries' }), 'groceries') // legacy emoji
  assert.equal(categoryIconKey({ icon: null, name: 'Mystery' }), 'other')
  assert.equal(categoryIconKey(null), 'other')
  const hints = {
    Taxi: 'taxi', Taxes: 'taxes', 'Public transport': 'bus', Transport: 'transport',
    'Car wash': 'transport', 'Card fees': 'bank-fees', Rent: 'rent', Mortgage: 'housing',
    'Gifts received': 'gifts-received', Gifts: 'gifts', Netflix: 'streaming', Spotify: 'music',
    'Water bill': 'water', Electricity: 'electricity', 'Home internet': 'internet',
    'Mobile phone': 'phone', 'Petrol': 'fuel', 'Parking': 'parking', 'Flights': 'flights',
    'Hotels': 'hotel', 'Bars & pubs': 'bars', 'Restaurants': 'utensils', 'Video games': 'games',
    'Books': 'books', 'Sports': 'sports', 'Hobbies': 'hobbies', 'Freelance': 'freelance',
    'Investments': 'investments', 'Refunds': 'refunds', 'ATM withdrawal': 'cash',
    'Transfer to savings': 'transfer', 'Savings': 'savings', 'Business expenses': 'business',
    'Electronics': 'electronics', 'Insurance': 'insurance', 'Bike repairs': 'bike',
  }
  for (const [name, key] of Object.entries(hints)) assert.equal(categoryIconKey(name), key, name)
  // Every suggestion is a key the server accepts.
  for (const name of Object.keys(hints)) assert.ok(CATEGORY_ICON_KEYS.includes(categoryIconKey(name)))
})
