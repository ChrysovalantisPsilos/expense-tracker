import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createQueryCache, queryCacheKey } from '../src/shared/lib/queryCache.js'

test('get: undefined for an unknown key, { data } for a known one', () => {
  const c = createQueryCache()
  assert.equal(c.get('a'), undefined)
  const rows = [{ id: 1 }]
  c.set('a', rows)
  assert.equal(c.get('a').data, rows) // the same object: nothing is copied
})

test('a null or empty answer is still a hit', () => {
  const c = createQueryCache()
  c.set('none', null)
  c.set('empty', [])
  assert.deepEqual(c.get('none'), { data: null })
  assert.deepEqual(c.get('empty'), { data: [] })
})

test('set replaces the answer for a key', () => {
  const c = createQueryCache()
  c.set('a', [1])
  c.set('a', [1, 2])
  assert.deepEqual(c.get('a').data, [1, 2])
  assert.equal(c.size, 1)
})

test('past max, the least recently used key goes', () => {
  const c = createQueryCache(2)
  c.set('a', 1)
  c.set('b', 2)
  c.get('a') // a is now the most recent
  c.set('c', 3)
  assert.equal(c.get('b'), undefined)
  assert.equal(c.get('a').data, 1)
  assert.equal(c.get('c').data, 3)
  assert.equal(c.size, 2)
})

test('clear empties it (sign-out)', () => {
  const c = createQueryCache()
  c.set('a', 1)
  c.clear()
  assert.equal(c.get('a'), undefined)
  assert.equal(c.size, 0)
})

test('queryCacheKey: differs by name, user and every input', () => {
  const base = queryCacheKey('transactions', ['u1', 'transactions', '*', 'expense', '2026-09-01'])
  assert.equal(base, queryCacheKey('transactions', ['u1', 'transactions', '*', 'expense', '2026-09-01']))
  assert.notEqual(base, queryCacheKey('budgets', ['u1', 'transactions', '*', 'expense', '2026-09-01']))
  assert.notEqual(base, queryCacheKey('transactions', ['u2', 'transactions', '*', 'expense', '2026-09-01']))
  assert.notEqual(base, queryCacheKey('transactions', ['u1', 'transactions', '*', 'income', '2026-09-01']))
  assert.notEqual(base, queryCacheKey('transactions', ['u1', 'transactions', '*', 'expense', '2026-10-01']))
})
