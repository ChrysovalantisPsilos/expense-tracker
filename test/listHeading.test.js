import { test } from 'node:test'
import assert from 'node:assert/strict'
import { listHeading, countLabel, isFirstRun } from '../src/features/transactions/listHeading.js'

test('countLabel: singular and plural', () => {
  assert.equal(countLabel(0), '0 entries')
  assert.equal(countLabel(1), '1 entry')
  assert.equal(countLabel(3), '3 entries')
  assert.equal(countLabel(1, 'result', 'results'), '1 result')
})

test('listHeading: title by kind, period and count as the subtitle', () => {
  assert.deepEqual(listHeading({ kind: 'expense', periodLabel: 'This month', count: 3 }),
    { title: 'Expenses', subtitle: 'This month · 3 entries' })
  assert.deepEqual(listHeading({ kind: 'income', periodLabel: 'August 2026', count: 1 }),
    { title: 'Income', subtitle: 'August 2026 · 1 entry' })
  assert.deepEqual(listHeading({ periodLabel: 'This month', count: 0 }),
    { title: 'All transactions', subtitle: 'This month · 0 entries' })
})

test('listHeading: no count while loading', () => {
  assert.deepEqual(listHeading({ kind: 'expense', periodLabel: 'This month', count: 0, loading: true }),
    { title: 'Expenses', subtitle: 'This month' })
})

test('listHeading: a search counts results', () => {
  assert.deepEqual(listHeading({ kind: 'expense', periodLabel: 'This month', count: 2, searching: true }),
    { title: 'Search results', subtitle: '2 results' })
  assert.deepEqual(listHeading({ count: 0, searching: true, loading: true }),
    { title: 'Search results', subtitle: 'Searching…' })
})

test('listHeading: no count when the list failed to load, so it never reads "0 entries"', () => {
  assert.deepEqual(listHeading({ kind: 'expense', periodLabel: 'This month', count: 0, failed: true }),
    { title: 'Expenses', subtitle: 'This month' })
  assert.deepEqual(listHeading({ count: 0, searching: true, failed: true }),
    { title: 'Search results', subtitle: '' })
})

test('isFirstRun: only a loaded, empty list with no first transaction at all', () => {
  const base = { loading: false, failed: false, count: 0, oldest: null }
  assert.equal(isFirstRun(base), true)
  assert.equal(isFirstRun({ ...base, loading: true }), false)
  assert.equal(isFirstRun({ ...base, failed: true }), false)
  assert.equal(isFirstRun({ ...base, searching: true }), false)
  assert.equal(isFirstRun({ ...base, count: 2 }), false)
  assert.equal(isFirstRun({ ...base, oldest: '2026-01-04' }), false) // entries in other periods
  assert.equal(isFirstRun({ ...base, oldest: undefined }), false) // not known (yet, or unreadable)
})
