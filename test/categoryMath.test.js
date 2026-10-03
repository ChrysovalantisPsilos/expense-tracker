import { test } from 'node:test'
import assert from 'node:assert/strict'
import { payCalendar } from '../src/shared/lib/payCalendar.js'
import { readFileSync } from 'node:fs'
import {
  CATEGORY_NAME_MAX, categoryNameError, sortCategories, moveTargets, sameKindOthers,
  categoryPatch, categoryPeriod, NEW_DEFAULT_CATEGORIES, NEW_TAG_MS, isNewCategory, categoryDraft,
  categoryPageHead, categoryBudget, entryCategoryBox, entryMonth,
} from '../src/features/categories/categoryMath.js'
import { NO_CATEGORY, presetCategoryId, newCategoryRow, categoryUpdateRow } from '../src/shared/lib/categoryName.js'
import { latestSql } from './migrations.js'
import { setLanguage } from '../mobile-core/index.js'
import {
  CATEGORY_ICON_KEYS, CATEGORY_ICON_LABELS, CATEGORY_ICON_GROUPS, CATEGORY_COLOR_KEYS,
  CATEGORY_COLORS, categoryTile, categoryIconKey, categoryLook, categoryPicker,
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

test('categoryPatch: "Counts as savings" toggles on income categories only', () => {
  const inc = { id: 2, name: 'Savings', icon: 'savings', color: null, kind: 'income', is_savings: false }
  const form = { name: 'Savings', icon: 'savings', color: null }
  assert.deepEqual(categoryPatch(inc, { ...form, savings: true }), { is_savings: true })
  assert.deepEqual(categoryPatch({ ...inc, is_savings: true }, { ...form, savings: false }), { is_savings: false })
  assert.equal(categoryPatch({ ...inc, is_savings: true }, { ...form, savings: true }), null)
  assert.equal(categoryPatch(inc, form), null) // no switch value: off, unchanged
  // An expense category never sends it (the server's CHECK would refuse).
  assert.equal(categoryPatch({ ...inc, kind: 'expense' }, { ...form, savings: true }), null)
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

test('categoryLook: the icon key, the tone by kind and the tint of a picked colour', () => {
  const pets = { id: 'c1', name: 'Pets', icon: 'gifts', color: 'blue' }
  assert.deepEqual(categoryLook(pets, 'expense'),
    { key: 'gifts', tone: 'accent', tint: { fg: CATEGORY_COLORS.blue, bg: `${CATEGORY_COLORS.blue}29` } })
  assert.deepEqual(categoryLook({ name: 'Salary', icon: null, color: null }, 'income'),
    { key: 'salary', tone: 'positive', tint: null })
  // Uncategorised (no row), a plain name, no kind.
  assert.deepEqual(categoryLook(null), { key: 'other', tone: 'accent', tint: null })
  assert.deepEqual(categoryLook(undefined, 'income'), { key: 'other', tone: 'positive', tint: null })
  assert.deepEqual(categoryLook('Taxi'), { key: 'taxi', tone: 'accent', tint: null })
})

// The icon and colour keys are CHECK constraints on the server (colours: 0060;
// icons: the latest widening, 0113) and Lucide mappings in icons.jsx — all
// three lists must stay identical.
const sqlList = (sql, column) => {
  const m = sql.match(new RegExp(`${column} is null or ${column} in \\(([^)]*)\\)`))
  return m[1].match(/'([a-z-]+)'/g).map((s) => s.slice(1, -1))
}

test('icon/colour keys match the CHECK constraints and the icon registry', () => {
  const sql = readFileSync(new URL('../supabase/migrations/0060_category_management.sql', import.meta.url), 'utf8')
  const iconSql = readFileSync(new URL('../supabase/migrations/0113_credit_card_icon.sql', import.meta.url), 'utf8')
  assert.deepEqual(sqlList(iconSql, 'icon'), CATEGORY_ICON_KEYS)
  assert.deepEqual(sqlList(sql, 'color'), CATEGORY_COLOR_KEYS)
  const icons = readFileSync(new URL('../src/shared/lib/icons.jsx', import.meta.url), 'utf8')
  const registry = icons.slice(icons.indexOf('const CATEGORY_ICONS = {'), icons.indexOf('}', icons.indexOf('const CATEGORY_ICONS = {')))
  assert.deepEqual([...registry.matchAll(/^\s+'?([a-z-]+)'?:/gm)].map((m) => m[1]), CATEGORY_ICON_KEYS)
  // Each key renders its own Lucide icon, so no two categories look alike.
  const comps = [...registry.matchAll(/^\s+'?[a-z-]+'?:\s*(\w+),/gm)].map((m) => m[1])
  assert.equal(comps.length, CATEGORY_ICON_KEYS.length)
  assert.deepEqual(comps.filter((c, i) => comps.indexOf(c) !== i), [])
  // Salary is a wallet (not a suitcase: that read as travel/business).
  assert.match(registry, /^\s+salary: Wallet,/m)
})

test('icon picker: every key has a label and sits in exactly one group', () => {
  const grouped = CATEGORY_ICON_GROUPS.flatMap((g) => g.keys)
  assert.deepEqual([...grouped].sort(), [...CATEGORY_ICON_KEYS].sort())
  assert.equal(new Set(grouped).size, grouped.length)
  assert.deepEqual(Object.keys(CATEGORY_ICON_LABELS).sort(), [...CATEGORY_ICON_KEYS].sort())
  assert.equal(new Set(CATEGORY_ICON_KEYS).size, CATEGORY_ICON_KEYS.length)
})

test('categoryPicker: the icon groups with each icon named, then the colours with their hex', () => {
  const picker = categoryPicker()
  assert.deepEqual(picker.icons.map((g) => g.label), ['Everyday', 'Home & bills', 'Getting around & leisure', 'Money & work'])
  assert.deepEqual(picker.icons.flatMap((g) => g.keys.map((k) => k.key)), CATEGORY_ICON_GROUPS.flatMap((g) => g.keys))
  assert.ok(picker.icons.every((g) => g.keys.every((k) => k.label === CATEGORY_ICON_LABELS[k.key])))
  assert.deepEqual(picker.colours.map((c) => c.key), CATEGORY_COLOR_KEYS)
  assert.deepEqual(picker.colours[0], { key: 'coral', hex: CATEGORY_COLORS.coral, label: 'coral' })
})

test('categoryDraft: where the add/edit form starts', () => {
  assert.deepEqual(categoryDraft(null), { name: '', icon: 'other', color: null, savings: false })
  assert.deepEqual(categoryDraft({ id: 'a', name: 'Taxi', icon: null, color: 'teal', is_savings: false }),
    { name: 'Taxi', icon: 'taxi', color: 'teal', savings: false })
  assert.deepEqual(categoryDraft({ id: 'b', name: 'Savings', default_key: 'savings', kind: 'income', icon: 'savings', is_savings: true }),
    { name: 'Savings', icon: 'savings', color: null, savings: true })
})

test('newCategoryRow / categoryUpdateRow: the name trimmed, savings only on income', () => {
  assert.deepEqual(newCategoryRow({ name: '  Pets ', kind: 'expense', icon: 'gifts', color: null, savings: true }),
    { name: 'Pets', kind: 'expense', icon: 'gifts', color: null, is_savings: false })
  assert.deepEqual(newCategoryRow({ name: 'Pot', kind: 'income', savings: true }),
    { name: 'Pot', kind: 'income', icon: null, color: null, is_savings: true })
  assert.deepEqual(categoryUpdateRow({ name: ' Food ', color: 'teal' }), { name: 'Food', color: 'teal' })
  assert.deepEqual(categoryUpdateRow({ is_archived: true }), { is_archived: true })
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
    'Salary': 'salary', 'Paycheck': 'salary', 'Payday': 'salary', 'Wages': 'salary',
  }
  for (const [name, key] of Object.entries(hints)) assert.equal(categoryIconKey(name), key, name)
  // Every suggestion is a key the server accepts.
  for (const name of Object.keys(hints)) assert.ok(CATEGORY_ICON_KEYS.includes(categoryIconKey(name)))
})

test('isNewCategory: the new default income categories wear "New" for two days', () => {
  const at = Date.parse('2026-09-25T10:00:00Z')
  const bonus = { name: 'Bonus', kind: 'income', created_at: '2026-09-25T10:00:00Z' }
  assert.equal(isNewCategory(bonus, at), true)
  assert.equal(isNewCategory(bonus, at + NEW_TAG_MS - 1), true)
  assert.equal(isNewCategory(bonus, at + NEW_TAG_MS), false) // gone after 2 days
  assert.equal(NEW_TAG_MS, 2 * 24 * 60 * 60 * 1000)
  assert.equal(isNewCategory({ ...bonus, name: 'Friends & family' }, at), true)
  assert.equal(isNewCategory({ ...bonus, name: 'Savings', is_savings: true }, at), true)
  // Only those, only as income; the user's own new categories aren't tagged.
  assert.equal(isNewCategory({ ...bonus, kind: 'expense' }, at), false)
  assert.equal(isNewCategory({ ...bonus, name: 'Groceries' }, at), false)
  assert.equal(isNewCategory({ name: 'Bonus', kind: 'income' }, at), false) // no created_at
  assert.equal(isNewCategory(bonus, at - 1000), false) // clock behind: no tag
})

test('the new default income categories match the seed and the backfills (0082, renamed in 0083; 0084)', () => {
  const seed = latestSql('seed_default_categories')
  const sql = (f) => readFileSync(new URL(`../supabase/migrations/${f}`, import.meta.url), 'utf8')
  const backfill = sql('0082_backfill_new_income_categories.sql')
  const rename = sql('0083_rename_friend_transfer.sql')
  const savings = sql('0084_savings_category.sql')
  // 0082 added "Friend Transfer"; 0083 renames it to what the app lists.
  const backfilled = (name) => (name === 'Friends & family' ? 'Friend Transfer' : name)
  assert.match(rename, /set name = 'Friends & family'\s+where c\.name = 'Friend Transfer'/)
  for (const { name, icon, kind, savings: isSavings } of NEW_DEFAULT_CATEGORIES) {
    assert.equal(kind, 'income')
    assert.ok(CATEGORY_ICON_KEYS.includes(icon), icon)
    if (isSavings) {
      // Seeded and backfilled marked as savings; an existing income category
      // of that name is marked instead of duplicated.
      assert.match(seed, new RegExp(`\\(uid, '${name}',\\s*'${icon}',\\s*'income', true, '[a-zA-Z]+'\\)`), name)
      assert.match(savings, new RegExp(`select p\\.id, '${name}', '${icon}', 'income'::public\\.txn_kind, true`), name)
      assert.match(savings, /on conflict \(user_id, name, kind\) do update set is_savings = true/)
    } else {
      assert.match(seed, new RegExp(`\\(uid, '${name}',\\s*'${icon}',\\s*'income',\\s*'[a-zA-Z]+'\\)`), name)
      assert.match(backfill, new RegExp(`\\('${backfilled(name)}',\\s*'${icon}'\\)`), name)
    }
  }
  assert.deepEqual(NEW_DEFAULT_CATEGORIES.filter((d) => d.savings).map((d) => d.name), ['Savings'])
  // Every seeded icon is one the app (and the DB check) knows.
  const icons = [...seed.matchAll(/\(uid, '[^']+',\s*'([a-z-]+)'/g)].map((m) => m[1])
  assert.equal(icons.length, 13)
  for (const icon of icons) assert.ok(CATEGORY_ICON_KEYS.includes(icon), icon)
  // Savings can only be income, and the seed keeps its definer hardening.
  assert.match(savings, /check \(not is_savings or kind = 'income'\)/)
  assert.match(seed, /security definer\s+set search_path = public, pg_temp/)
  assert.match(savings, /revoke execute on function public\.seed_default_categories\(\) from anon, public;/)
})

test('presetCategoryId: a category from a link counts only if it is one of the user’s active ones of that kind', () => {
  const cats = [
    { id: 'sav', kind: 'income', is_savings: true },
    { id: 'food', kind: 'expense' },
    { id: 'old', kind: 'income', is_archived: true },
  ]
  assert.equal(presetCategoryId('sav', cats, 'income'), 'sav')
  assert.equal(presetCategoryId('food', cats, 'income'), '') // wrong kind
  assert.equal(presetCategoryId('old', cats, 'income'), '') // archived
  assert.equal(presetCategoryId('someone-elses', cats, 'income'), '') // not the user's
  assert.equal(presetCategoryId('', cats, 'income'), '')
  assert.equal(presetCategoryId(null, cats, 'income'), '')
  assert.equal(presetCategoryId('sav', undefined, 'income'), '')
})

test('categoryPageHead: the name, the eyebrow and the total by kind (savings saved, never earned)', () => {
  const head = (c, none) => { const h = categoryPageHead(c, none); return [h.kind, h.name, h.eyebrow, h.totalLabel] }
  assert.deepEqual(head({ id: 'a', name: 'Pets', kind: 'expense' }), ['expense', 'Pets', 'Category', 'Spent'])
  assert.deepEqual(head({ id: 'b', name: 'Tips', kind: 'income' }), ['income', 'Tips', 'Income category', 'Earned'])
  assert.deepEqual(head({ id: 'c', name: 'Pot', kind: 'income', is_savings: true }),
    ['income', 'Pot', 'Savings category', 'Saved'])
  assert.deepEqual(head({ id: 'd', name: 'Old', kind: 'expense', is_archived: true }),
    ['expense', 'Old', 'Archived category', 'Spent'])
  assert.deepEqual(head(null, true), ['expense', 'Uncategorized', 'Category', 'Spent'])
})

test('categoryBudget: monthly only, the bar with a carried cap, set this month, none in the past', () => {
  const period = { value: 'm:2026-9', from: '2026-09-01', to: '2026-09-30', label: 'This month' }
  const base = { spent: 9000, month: true, canEdit: true, period, baseCurrency: 'EUR' }
  assert.deepEqual(categoryBudget({ ...base, month: false, budget: null }),
    { state: 'monthly', text: 'Budgets are monthly — pick a month to see one.' })
  assert.deepEqual(categoryBudget({ ...base, budget: { amount_minor: 10000, period_start: '2026-08-01' } }), {
    state: 'bar', title: 'Budget', meta: '€90.00 of €100.00', percent: 90, tone: 'warning', over: false,
    carried: 'Carried over from August',
  })
  const over = categoryBudget({ ...base, spent: 12000, budget: { amount_minor: 10000, period_start: '2026-09-01' } })
  assert.equal(over.tone, 'negative')
  assert.equal(over.over, true)
  assert.equal(over.carried, null)
  assert.equal(categoryBudget({ ...base, spent: 100, budget: { amount_minor: 10000, period_start: '2026-09-01' } }).tone, null)
  assert.deepEqual(categoryBudget({ ...base, budget: null }), { state: 'set', text: 'Set a budget' })
  assert.deepEqual(categoryBudget({ ...base, canEdit: false, budget: null, period: { ...period, label: 'August 2026' } }),
    { state: 'none', text: 'No budget in August 2026.' })
})

test('entryMonth: the month an entry was paid in, labelled as the pickers do', () => {
  const now = new Date(2026, 8, 18)
  assert.deepEqual(entryMonth({ spent_at: '2026-09-17' }, now),
    { value: 'm:2026-9', key: '2026-09', label: 'This month', from: '2026-09-01', to: '2026-09-30', open: true })
  assert.equal(entryMonth({ spent_at: '2026-08-03' }, now).value, 'm:2026-8')
  assert.equal(entryMonth({ spent_at: '2026-08-03' }, now).label, 'August 2026')
  // Without a readable day: this month.
  assert.equal(entryMonth({ spent_at: null }, now).value, 'm:2026-9')
})

test('entryMonth / entryCategoryBox: with pay months, an expense on 30 Sep after payday is October\'s', () => {
  const cal = payCalendar({ fromDay: 25, categoryId: 'pay' }, ['2026-08-28', '2026-09-29'], '2026-10-03')
  const now = new Date(2026, 9, 3)
  const oct = entryMonth({ spent_at: '2026-09-30' }, now, cal)
  assert.equal(oct.value, 'm:2026-10')
  assert.equal(oct.label, 'This month')
  assert.equal(oct.from, '2026-09-29')
  assert.equal(entryMonth({ spent_at: '2026-09-28' }, now, cal).value, 'm:2026-9')
  // The carried cap is compared with the month's label, not its first day.
  const line = categoryBudget({
    budget: { amount_minor: 10000, period_start: '2026-10-01' }, spent: 500, month: true, canEdit: true,
    period: oct, baseCurrency: 'EUR',
  })
  assert.equal(line.carried, null)
  // The box's list and total share the pay window.
  const category = { id: 'c1', name: 'Groceries', kind: 'expense' }
  const row = (id, spent_at) => ({ id, spent_at, kind: 'expense', amount_minor: 1000, currency: 'EUR', exchange_rate: 1,
    category_id: 'c1', categories: category })
  const box = entryCategoryBox({ entry: row('e', '2026-09-30'), category, cal, baseCurrency: 'EUR',
    rows: [row('e', '2026-09-30'), row('o', '2026-10-02'), row('x', '2026-09-27')] }, now)
  assert.deepEqual(box.others.map((o) => o.id), ['o'])
  assert.equal(box.path, '/categories/c1?period=m%3A2026-10')
})

test('entryCategoryBox: the category this month, its budget and its other entries, newest first', () => {
  const now = new Date(2026, 8, 18)
  const category = { id: 'c1', name: 'Groceries', kind: 'expense' }
  const row = (o) => ({
    id: 'x', kind: 'expense', category_id: 'c1', amount_minor: 1000, exchange_rate: 1, currency: 'EUR',
    spent_at: '2026-09-10', spread_months: null, description: 'Market', ...o,
  })
  const entry = row({ id: 'e', amount_minor: 4250, spent_at: '2026-09-17' })
  const rows = [
    entry,
    row({ id: 'a', amount_minor: 6135, spent_at: '2026-09-12' }),
    row({ id: 'b', amount_minor: 4875, spent_at: '2026-09-05' }),
    row({ id: 'c', amount_minor: 2000, spent_at: '2026-09-14', currency: 'USD', exchange_rate: 0.9, description: '' }),
    row({ id: 'd', amount_minor: 500, spent_at: '2026-09-01' }),
    row({ id: 'aug', spent_at: '2026-08-31' }),
  ]
  const budget = { category_id: 'c1', amount_minor: 25000, period_start: '2026-09-01' }
  const box = entryCategoryBox({ entry, category, rows, budget, baseCurrency: 'EUR' }, now)
  assert.equal(box.title, 'Groceries · This month')
  assert.equal(box.path, '/categories/c1?period=m%3A2026-9')
  assert.equal(box.seeAll, 'See all')
  // The month's spend against its cap: 42.50 + 61.35 + 48.75 + 18.00 + 5.00 = €175.60.
  assert.deepEqual(box.budget, {
    state: 'bar', title: 'Budget', meta: '€175.60 of €250.00', percent: 70, tone: null, over: false, carried: null,
    valueLabel: '70%',
  })
  // The others, newest first, the entry itself left out; three of them; a foreign one in its own currency.
  assert.deepEqual(box.others, [
    { id: 'c', name: 'Groceries', date: '14 Sep', amount: '$20.00' },
    { id: 'a', name: 'Market', date: '12 Sep', amount: '€61.35' },
    { id: 'b', name: 'Market', date: '5 Sep', amount: '€48.75' },
  ])
  assert.equal(box.empty, null)
  assert.equal(entryCategoryBox({ entry, category, rows, budget, baseCurrency: 'EUR', limit: 10 }, now).others.length, 4)

  // No budget (or an income category): no bar. Alone in its month: the words for none.
  const alone = entryCategoryBox({ entry, category, rows: [entry], baseCurrency: 'EUR' }, now)
  assert.equal(alone.budget, null)
  assert.deepEqual(alone.others, [])
  assert.equal(alone.empty, 'No other entries · This month')
  // In Greek, the web's words and amounts.
  setLanguage('el')
  try {
    const el = entryCategoryBox({ entry, category, rows, budget, baseCurrency: 'EUR' }, now)
    assert.equal(el.title, 'Groceries · Αυτός ο μήνας')
    assert.equal(el.seeAll, 'Όλα')
    assert.match(el.others[1].amount, /^61,35\s€$/)
  } finally {
    setLanguage('en')
  }
  const pay = { id: 'i1', name: 'Salary', kind: 'income' }
  const salary = row({ id: 's', kind: 'income', category_id: 'i1' })
  assert.equal(entryCategoryBox({ entry: salary, category: pay, rows: [salary], budget, baseCurrency: 'EUR' }, now).budget, null)

  // A past month says its name.
  const past = row({ id: 'p', spent_at: '2026-08-20' })
  assert.equal(entryCategoryBox({ entry: past, category, rows: [past], baseCurrency: 'EUR' }, now).title, 'Groceries · August 2026')

  // No box: no category, another category's row, a group's share.
  assert.equal(entryCategoryBox({ entry: row({ category_id: null }), category, rows, baseCurrency: 'EUR' }, now), null)
  assert.equal(entryCategoryBox({ entry, category: { ...category, id: 'c2' }, rows, baseCurrency: 'EUR' }, now), null)
  assert.equal(entryCategoryBox({ entry: { ...entry, group_expense_id: 'g' }, category, rows, baseCurrency: 'EUR' }, now), null)
})
