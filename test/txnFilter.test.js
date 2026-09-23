import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseTxnType, isFiltering, filterTransactions, netBaseMinor, EMPTY_FILTERS, NO_CATEGORY,
} from '../src/features/transactions/txnFilter.js'

const row = (o) => ({ kind: 'expense', amount_minor: 1000, exchange_rate: 1, currency: 'EUR', ...o })

test('parseTxnType accepts the three modes and defaults to expense', () => {
  assert.equal(parseTxnType('expense'), 'expense')
  assert.equal(parseTxnType('income'), 'income')
  assert.equal(parseTxnType('all'), 'all')
  assert.equal(parseTxnType(null), 'expense')
  assert.equal(parseTxnType('bogus'), 'expense')
})

test('isFiltering: text or any advanced filter', () => {
  assert.equal(isFiltering('', EMPTY_FILTERS), false)
  assert.equal(isFiltering('   ', EMPTY_FILTERS), false)
  assert.equal(isFiltering('cof', EMPTY_FILTERS), true)
  assert.equal(isFiltering('', { ...EMPTY_FILTERS, min: '5' }), true)
  assert.equal(isFiltering('', { ...EMPTY_FILTERS, categoryId: 'c1' }), true)
})

test('text matches description, notes and category name, case-insensitively', () => {
  const rows = [
    row({ id: 1, description: 'Coffee' }),
    row({ id: 2, notes: 'with the COFFEE crew' }),
    row({ id: 3, categories: { name: 'Coffee shops' } }),
    row({ id: 4, description: 'Rent', notes: null }),
  ]
  assert.deepEqual(filterTransactions(rows, { text: ' coffee ' }, 'EUR').map((r) => r.id), [1, 2, 3])
  assert.equal(filterTransactions(rows, { text: '' }, 'EUR').length, 4)
})

test('amount range compares in the base currency', () => {
  const rows = [
    row({ id: 1, amount_minor: 500 }), // €5
    row({ id: 2, amount_minor: 2000 }), // €20
    row({ id: 3, amount_minor: 1000, currency: 'USD', exchange_rate: 0.5 }), // €5
    row({ id: 4, amount_minor: 1500, currency: 'JPY', exchange_rate: 0.01 }), // ¥1500 → €15
  ]
  assert.deepEqual(filterTransactions(rows, { min: '10' }, 'EUR').map((r) => r.id), [2, 4])
  assert.deepEqual(filterTransactions(rows, { max: '5' }, 'EUR').map((r) => r.id), [1, 3])
  assert.deepEqual(filterTransactions(rows, { min: '6', max: '16' }, 'EUR').map((r) => r.id), [4])
})

test('netBaseMinor adds income and subtracts expenses', () => {
  const rows = [
    row({ amount_minor: 1000 }),
    row({ kind: 'income', amount_minor: 5000 }),
    row({ amount_minor: 2000, currency: 'USD', exchange_rate: 0.5 }),
  ]
  assert.equal(netBaseMinor(rows, 'EUR'), 5000 - 1000 - 1000)
  assert.equal(netBaseMinor([], 'EUR'), 0)
})

test('NO_CATEGORY keeps only uncategorised personal rows', () => {
  const rows = [
    row({ id: 1, category_id: 'c1', categories: { name: 'Food' } }),
    row({ id: 2, category_id: null }),
    row({ id: 3, category_id: null, group_expense_id: 'g1' }), // a group share: bucketed by group
  ]
  const ids = (f) => filterTransactions(rows, f, 'EUR').map((r) => r.id)
  assert.deepEqual(ids({ categoryId: NO_CATEGORY }), [2])
  assert.deepEqual(ids({ categoryId: 'c1' }), [1, 2, 3]) // a real category is filtered server-side
  assert.equal(isFiltering('', { ...EMPTY_FILTERS, categoryId: NO_CATEGORY }), true)
})
