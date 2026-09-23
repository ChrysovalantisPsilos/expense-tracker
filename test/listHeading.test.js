import { test } from 'node:test'
import assert from 'node:assert/strict'
import { listHeading, countLabel } from '../src/features/transactions/listHeading.js'

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
