import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseLedgerParams, withLedgerParams, categoryLink, linkBuckets,
} from '../src/features/transactions/ledgerLinks.js'
import { EMPTY_FILTERS, NO_CATEGORY } from '../src/features/transactions/txnFilter.js'
import { categoryBars } from '../src/features/dashboard/categoryBars.js'

const CAT = '0b6c2f3e-8d1a-4c55-9f00-1234567890ab'
const CAT2 = '5d7e9a10-2b3c-4d5e-8f60-abcdefabcdef'
const GROUP = 'aa11bb22-cc33-4d44-8e55-ff6677889900'
const sep = { from: '2026-09-01', to: '2026-09-30', label: 'September 2026' }
const qs = (href) => new URLSearchParams(href.split('?')[1])

test('parseLedgerParams: empty URL is expenses, no text, no filters', () => {
  assert.deepEqual(parseLedgerParams(new URLSearchParams('')),
    { type: 'expense', text: '', filters: EMPTY_FILTERS })
})

test('parseLedgerParams: reads type, text and every filter', () => {
  const p = new URLSearchParams(
    `type=all&q=coffee&category=${CAT}&from=2026-09-01&to=2026-09-30&min=5&max=12.5`)
  assert.deepEqual(parseLedgerParams(p), {
    type: 'all', text: 'coffee',
    filters: { categoryId: CAT, from: '2026-09-01', to: '2026-09-30', min: '5', max: '12.5' },
  })
  assert.equal(parseLedgerParams(new URLSearchParams('category=none')).filters.categoryId, NO_CATEGORY)
})

test('parseLedgerParams: malformed values are dropped, never sent to the server', () => {
  const p = new URLSearchParams(
    'type=bogus&category=1;drop&from=2026-02-30&to=30/09/2026&min=abc&max=.')
  assert.deepEqual(parseLedgerParams(p), { type: 'expense', text: '', filters: EMPTY_FILTERS })
  // Leap day is a real date; MoneyInput's mid-typing "12." is kept.
  const ok = parseLedgerParams(new URLSearchParams('from=2028-02-29&min=12.'))
  assert.equal(ok.filters.from, '2028-02-29')
  assert.equal(ok.filters.min, '12.')
})

test('withLedgerParams: sets, removes and keeps params; maps text → q', () => {
  const start = new URLSearchParams(`type=income&q=rent&category=${CAT}&utm=x`)
  const next = withLedgerParams(start, { text: '', categoryId: CAT2, from: '2026-01-01', bogus: 'y' })
  assert.equal(next.get('q'), null)
  assert.equal(next.get('category'), CAT2)
  assert.equal(next.get('from'), '2026-01-01')
  assert.equal(next.get('type'), 'income')
  assert.equal(next.get('utm'), 'x') // unrelated params survive
  assert.equal(next.get('bogus'), null)
  assert.equal(start.get('q'), 'rent') // input untouched
})

test('categoryLink round-trips through parseLedgerParams', () => {
  const href = categoryLink('Groceries', CAT, sep).to
  assert.ok(href.startsWith('/transactions?'))
  assert.deepEqual(parseLedgerParams(qs(href)), {
    type: 'expense', text: '',
    filters: { ...EMPTY_FILTERS, categoryId: CAT, from: '2026-09-01', to: '2026-09-30' },
  })
})

test('categoryLink: path + accessible name for the period', () => {
  const l = categoryLink('Groceries', CAT, sep)
  assert.equal(l.label, 'Show Groceries expenses for September 2026')
  assert.equal(qs(l.to).get('category'), CAT)
  assert.equal(qs(l.to).get('to'), '2026-09-30')
  assert.equal(categoryLink('Rent', CAT, { from: '2026-09-01', to: '2026-09-30', label: 'This month' }).label,
    'Show Rent expenses for this month')
  // All time: no dates in the link at all.
  const all = categoryLink('Rent', CAT, { from: null, to: null, label: 'All time' })
  assert.equal(all.label, 'Show Rent expenses for all time')
  assert.equal(qs(all.to).has('from'), false)
  assert.equal(qs(all.to).has('to'), false)
})

const tx = (o) => ({
  kind: 'expense', spent_at: '2026-09-10', amount_minor: 1000, exchange_rate: 1, currency: 'EUR', ...o,
})
const groceries = (o) => tx({ category_id: CAT, categories: { name: 'Groceries' }, ...o })
const share = (o) => tx({
  group_expense_id: 'ge1', group_id: GROUP, group_expenses: { groups: { name: 'Lisbon' } }, ...o,
})

test('linkBuckets: category, uncategorised and group buckets each get their target', () => {
  const items = [{ name: 'Groceries' }, { name: 'Uncategorized' }, { name: 'Lisbon' }]
  const rows = [groceries(), tx({}), share()]
  const [g, u, l] = linkBuckets(items, rows, sep)
  assert.equal(qs(g.to).get('category'), CAT)
  assert.equal(qs(g.to).get('type'), 'expense')
  assert.equal(g.linkLabel, 'Show Groceries expenses for September 2026')
  assert.equal(qs(u.to).get('category'), NO_CATEGORY)
  assert.equal(u.linkLabel, 'Show Uncategorized expenses for September 2026')
  assert.equal(l.to, `/groups/${GROUP}`)
  assert.equal(l.linkLabel, 'Open the Lisbon group')
})

test('linkBuckets: folded Other, ambiguous names and unknown buckets stay unlinked', () => {
  const dupe = tx({ category_id: CAT2, categories: { name: 'Lisbon' } }) // a category named like the group
  const names = ['A', 'B', 'C', 'D', 'E', 'F', 'G']
  const rows = names.map((n, i) => tx({ category_id: `id-${n}`, categories: { name: n }, amount_minor: 700 - i * 100 }))
  const bars = linkBuckets(categoryBars(names.map((n, i) => ({ name: n, value: 700 - i * 100 }))), rows, sep)
  assert.equal(bars.at(-1).name, 'Other')
  assert.equal(bars.at(-1).folded, true)
  assert.equal(bars.at(-1).to, undefined)
  assert.ok(bars.slice(0, -1).every((b) => b.to))

  const [lisbon, missing] = linkBuckets([{ name: 'Lisbon' }, { name: 'Nope' }], [share(), dupe], sep)
  assert.equal(lisbon.to, undefined)
  assert.equal(missing.to, undefined)
  assert.deepEqual(missing, { name: 'Nope' }) // untouched
})

test('linkBuckets: a real "Other" category links when nothing is folded into it', () => {
  const rows = [tx({ category_id: CAT, categories: { name: 'Other' } })]
  const [other] = linkBuckets(categoryBars([{ name: 'Other', value: 1000 }]), rows, sep)
  assert.equal(qs(other.to).get('category'), CAT)
})

test('linkBuckets: only expense rows inside the period decide a bucket; nameOf reads labels', () => {
  const rows = [
    groceries({ spent_at: '2026-08-31', category_id: CAT2 }), // previous month: ignored
    groceries({ kind: 'income', category_id: CAT2 }), // income: ignored
    groceries(),
  ]
  const [g] = linkBuckets([{ label: 'Groceries', share: 100 }], rows, sep, (s) => s.label)
  assert.equal(qs(g.to).get('category'), CAT)
  assert.equal(g.share, 100)
})
