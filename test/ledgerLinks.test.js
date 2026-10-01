import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseLedgerParams, withLedgerParams,
} from '../src/features/transactions/ledgerLinks.js'
import { EMPTY_FILTERS } from '../src/features/transactions/txnFilter.js'
import { NO_CATEGORY } from '../src/shared/lib/categoryName.js'

const CAT = '0b6c2f3e-8d1a-4c55-9f00-1234567890ab'
const CAT2 = '5d7e9a10-2b3c-4d5e-8f60-abcdefabcdef'

test('parseLedgerParams: empty URL is expenses, no text, no filters', () => {
  assert.deepEqual(parseLedgerParams(new URLSearchParams('')),
    { type: 'expense', text: '', filters: EMPTY_FILTERS })
})

test('parseLedgerParams: reads type, text and every filter', () => {
  const p = new URLSearchParams(
    `type=all&q=coffee&category=${CAT}&from=2026-09-01&to=2026-09-30&min=5&max=12.5&shared=1`)
  assert.deepEqual(parseLedgerParams(p), {
    type: 'all', text: 'coffee',
    filters: { categoryId: CAT, from: '2026-09-01', to: '2026-09-30', min: '5', max: '12.5', shared: '1' },
  })
  assert.equal(parseLedgerParams(new URLSearchParams('shared=yes')).filters.shared, '')
  assert.equal(withLedgerParams(new URLSearchParams(''), { shared: '1' }).get('shared'), '1')
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

