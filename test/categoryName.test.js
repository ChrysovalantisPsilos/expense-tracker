import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { byDisplayName, categoryDisplayName } from '../src/shared/lib/categoryName.js'
import { bucketLabel, bucketLabels } from '../src/shared/lib/txnRollup.js'
import { loadLanguage } from '../src/shared/lib/i18n/i18n.js'
import en from '../src/locales/en/common.js'
import el from '../src/locales/el/common.js'

const migration = readFileSync(new URL('../supabase/migrations/0094_category_default_key.sql', import.meta.url), 'utf8')

test('categoryDisplayName: a default shows its translated name, anything else its stored name', async () => {
  const groceries = { name: 'Groceries', default_key: 'groceries' }
  const renamed = { name: 'Supermarket', default_key: null }
  assert.equal(categoryDisplayName(groceries), 'Groceries')
  assert.equal(categoryDisplayName(renamed), 'Supermarket')
  assert.equal(categoryDisplayName({ name: 'Pets' }), 'Pets')
  assert.equal(categoryDisplayName(null), '')
  assert.equal(categoryDisplayName(undefined), '')
  // An unknown key (a newer server) falls back to the stored name.
  assert.equal(categoryDisplayName({ name: 'Tolls', default_key: 'tolls' }), 'Tolls')
  await loadLanguage('el')
  try {
    assert.equal(categoryDisplayName(groceries), 'Σούπερ μάρκετ')
    assert.equal(categoryDisplayName({ name: 'Savings', default_key: 'savings' }), 'Αποταμιεύσεις')
    assert.equal(categoryDisplayName(renamed), 'Supermarket') // the user's own name is never translated
    assert.equal(categoryDisplayName({ name: 'Tolls', default_key: 'tolls' }), 'Tolls')
    // Pickers sort by the name shown.
    const sorted = [{ name: 'Salary', default_key: 'salary' }, { name: 'Bonus', default_key: 'bonus' },
      { name: 'Άλφα' }].sort(byDisplayName).map(categoryDisplayName)
    assert.deepEqual(sorted, ['Άλφα', 'Μισθός', 'Μπόνους'])
  } finally {
    await loadLanguage('en')
  }
})

test('defaultCategories: English is exactly the stored name, in lockstep with 0094', () => {
  const rows = [...migration.matchAll(/\('([^']+)',\s*'(expense|income)',\s*'([a-zA-Z]+)'\)/g)]
    .map(([, name, , key]) => [key, name])
  assert.equal(rows.length, 14)
  assert.deepEqual(Object.fromEntries(rows), en.defaultCategories)
  assert.deepEqual(Object.keys(el.defaultCategories).sort(), Object.keys(en.defaultCategories).sort())
  // Every key the seed passes is one the mapping knows.
  const seeded = [...migration.matchAll(/\(uid, '[^']+',\s*'[a-z-]+',\s*'(?:expense|income)',\s*(?:true, )?'([a-zA-Z]+)'\)/g)]
    .map((m) => m[1])
  assert.equal(seeded.length, 13)
  for (const key of seeded) assert.ok(key in en.defaultCategories, key)
})

test('bucketLabels / bucketLabel: breakdown buckets keep their stored name and show a translated label', async () => {
  const rows = [
    { categories: { name: 'Groceries', default_key: 'groceries' } },
    { categories: { name: 'Other', default_key: 'other' } },
    { categories: { name: 'Pets' } },
    { group_expense_id: 'g', group_expenses: { groups: { name: 'Lisbon' } } },
    {}, // no category
  ]
  await loadLanguage('el')
  try {
    const labels = bucketLabels(rows)
    assert.deepEqual([...labels.keys()], ['Groceries', 'Other', 'Pets', 'Lisbon', 'Χωρίς κατηγορία'])
    assert.equal(bucketLabel({ name: 'Groceries' }, labels), 'Σούπερ μάρκετ')
    assert.equal(bucketLabel({ name: 'Pets' }, labels), 'Pets')
    assert.equal(bucketLabel({ name: 'Lisbon' }, labels), 'Lisbon')
    assert.equal(bucketLabel({ name: 'Other' }, labels), 'Άλλα')
    // The folded tail (several buckets) is the translated leftover.
    assert.equal(bucketLabel({ name: 'Other', folded: true }, new Map()), 'Άλλα')
    assert.equal(bucketLabel({ name: 'Unknown' }, labels), 'Unknown')
  } finally {
    await loadLanguage('en')
  }
  assert.equal(bucketLabel({ name: 'Other', folded: true }, new Map()), 'Other')
})
