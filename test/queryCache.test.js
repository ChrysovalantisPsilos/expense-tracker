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

// Home warms the Add form's groups (myGroups' usePrefetchMyGroups).
test('prefetch: one read fills an empty key; repeats while in flight or answered read nothing', async () => {
  const c = createQueryCache()
  let reads = 0
  const read = async () => { reads++; return [{ id: 'g1' }] }
  const first = c.prefetch('my-groups', read)
  const again = c.prefetch('my-groups', read) // in flight: the same promise, no second read
  assert.equal(again, first)
  await first
  assert.equal(reads, 1)
  assert.deepEqual(c.get('my-groups').data, [{ id: 'g1' }])
  await c.prefetch('my-groups', read) // answered: nothing
  assert.equal(reads, 1)
  // No groups: the empty answer is cached too (the chips' row reads it at once).
  await c.prefetch('none', async () => [])
  assert.deepEqual(c.get('none'), { data: [] })
})

test('prefetch: a fresher answer, a failure or a sign-out wins over it', async () => {
  const c = createQueryCache()
  let release
  const gate = () => new Promise((resolve) => { release = resolve })
  const slow = c.prefetch('k', gate)
  await Promise.resolve() // the read starts on the next tick
  c.set('k', ['live']) // the page's own query answered first
  release(['prefetched'])
  await slow
  assert.deepEqual(c.get('k').data, ['live'])

  await c.prefetch('bad', async () => { throw new Error('offline') })
  assert.equal(c.get('bad'), undefined)
  let reads = 0
  await c.prefetch('bad', async () => { reads++; return [1] }) // a later try still reads
  assert.equal(reads, 1)

  const late = c.prefetch('old', gate)
  await Promise.resolve()
  c.clear() // signed out mid-read
  release(['someone else'])
  await late
  assert.equal(c.get('old'), undefined)
})

test('subscribe hears each answer stored under its key, until unsubscribed', () => {
  const c = createQueryCache()
  const heard = []
  const off = c.subscribe('a', (d) => heard.push(d))
  c.subscribe('b', () => heard.push('wrong key'))
  c.set('a', 1)
  c.set('a', 2, { quiet: true }) // an own optimistic edit tells no one
  c.set('a', 3)
  off()
  c.set('a', 4)
  assert.deepEqual(heard, [1, 3])
  assert.equal(c.get('a').data, 4)
})
