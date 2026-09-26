import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  categoryPath, parseCategoryRoute, categoryLink, linkBuckets,
} from '../src/features/categories/categoryLinks.js'
import { NO_CATEGORY } from '../src/features/transactions/txnFilter.js'
import { categoryBars } from '../src/features/dashboard/categoryBars.js'

const NOW = new Date(2026, 8, 15) // 15 Sep 2026
const CAT = '0b6c2f3e-8d1a-4c55-9f00-1234567890ab'
const CAT2 = '5d7e9a10-2b3c-4d5e-8f60-abcdefabcdef'
const GROUP = 'aa11bb22-cc33-4d44-8e55-ff6677889900'
const aug = { value: 'm:2026-8', from: '2026-08-01', to: '2026-08-31', label: 'August 2026' }
const route = (href) => {
  const [path, query = ''] = href.split('?')
  return parseCategoryRoute(decodeURIComponent(path.split('/')[2]), new URLSearchParams(query), NOW)
}

test('categoryPath: id and optional period token', () => {
  assert.equal(categoryPath(CAT), `/categories/${CAT}`)
  assert.equal(categoryPath(NO_CATEGORY, 'y:2025'), '/categories/none?period=y%3A2025')
})

test('parseCategoryRoute: round-trips categoryPath; defaults to this month', () => {
  assert.deepEqual(route(categoryPath(CAT, 'm:2026-8')), {
    categoryId: CAT,
    period: { value: 'm:2026-8', label: 'August 2026', from: '2026-08-01', to: '2026-08-31' },
  })
  assert.equal(route(categoryPath(NO_CATEGORY, 'all')).period.value, 'all')
  const plain = route(categoryPath(CAT))
  assert.equal(plain.period.value, 'm:2026-9')
  assert.equal(plain.period.label, 'This month')
})

test('parseCategoryRoute: malformed id is null; a junk period means this month', () => {
  assert.equal(parseCategoryRoute('1;drop', new URLSearchParams(''), NOW).categoryId, null)
  assert.equal(parseCategoryRoute(undefined, new URLSearchParams(''), NOW).categoryId, null)
  assert.equal(parseCategoryRoute(CAT, new URLSearchParams('period=m:2026-13'), NOW).period.value, 'm:2026-9')
})

test('categoryLink: category page + accessible name for the period', () => {
  const l = categoryLink('Groceries', CAT, aug)
  assert.equal(l.to, categoryPath(CAT, 'm:2026-8'))
  assert.equal(l.label, 'Show Groceries expenses for August 2026')
  assert.equal(categoryLink('Rent', CAT, { value: 'm:2026-9', label: 'This month' }).label,
    'Show Rent expenses for this month')
  assert.equal(categoryLink('Rent', CAT, { value: 'all', label: 'All time' }).label,
    'Show Rent expenses for all time')
  // No period token (Insights, budget rows): the page's default, this month.
  assert.equal(categoryLink('Rent', CAT, { label: 'This month' }).to, `/categories/${CAT}`)
})

const tx = (o) => ({
  kind: 'expense', spent_at: '2026-08-10', amount_minor: 1000, exchange_rate: 1, currency: 'EUR', ...o,
})
const groceries = (o) => tx({ category_id: CAT, categories: { name: 'Groceries' }, ...o })
const share = (o) => tx({
  group_expense_id: 'ge1', group_id: GROUP, group_expenses: { groups: { name: 'Lisbon' } }, ...o,
})

test('linkBuckets: category, uncategorised and group buckets each get their target', () => {
  const items = [{ name: 'Groceries' }, { name: 'Uncategorized' }, { name: 'Lisbon' }]
  const rows = [groceries(), tx({}), share()]
  const [g, u, l] = linkBuckets(items, rows, aug)
  assert.equal(g.to, categoryPath(CAT, 'm:2026-8'))
  assert.equal(g.linkLabel, 'Show Groceries expenses for August 2026')
  assert.equal(u.to, categoryPath(NO_CATEGORY, 'm:2026-8'))
  assert.equal(u.linkLabel, 'Show Uncategorized expenses for August 2026')
  assert.equal(l.to, `/groups/${GROUP}`)
  assert.equal(l.linkLabel, 'Open the Lisbon group')
})

test('linkBuckets: folded Other, ambiguous names and unknown buckets stay unlinked', () => {
  const dupe = tx({ category_id: CAT2, categories: { name: 'Lisbon' } }) // a category named like the group
  const names = ['A', 'B', 'C', 'D', 'E', 'F', 'G']
  const rows = names.map((n, i) => tx({ category_id: `id-${n}`, categories: { name: n }, amount_minor: 700 - i * 100 }))
  const bars = linkBuckets(categoryBars(names.map((n, i) => ({ name: n, value: 700 - i * 100 }))), rows, aug)
  assert.equal(bars.at(-1).name, 'Other')
  assert.equal(bars.at(-1).folded, true)
  assert.equal(bars.at(-1).to, undefined)
  assert.ok(bars.slice(0, -1).every((b) => b.to))

  const [lisbon, missing] = linkBuckets([{ name: 'Lisbon' }, { name: 'Nope' }], [share(), dupe], aug)
  assert.equal(lisbon.to, undefined)
  assert.equal(missing.to, undefined)
  assert.deepEqual(missing, { name: 'Nope' }) // untouched
})

test('linkBuckets: a real "Other" category links when nothing is folded into it', () => {
  const rows = [tx({ category_id: CAT, categories: { name: 'Other' } })]
  const [other] = linkBuckets(categoryBars([{ name: 'Other', value: 1000 }]), rows, aug)
  assert.equal(other.to, categoryPath(CAT, 'm:2026-8'))
})

test('linkBuckets: only expense rows inside the period decide a bucket', () => {
  const rows = [
    groceries({ spent_at: '2026-07-31', category_id: CAT2 }), // previous month: ignored
    groceries({ kind: 'income', category_id: CAT2 }), // income: ignored
    groceries(),
  ]
  const [g] = linkBuckets([{ name: 'Groceries', label: 'Groceries', share: 100 }], rows, aug)
  assert.equal(g.to, categoryPath(CAT, 'm:2026-8'))
  assert.equal(g.share, 100)
})
