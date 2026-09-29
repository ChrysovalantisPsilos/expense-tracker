import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pageCount, pageSlice } from '../src/shared/lib/paginate.js'

test('pageCount: at least 1 even when empty', () => {
  assert.equal(pageCount(0, 10), 1)
  assert.equal(pageCount(10, 10), 1)
  assert.equal(pageCount(11, 10), 2)
  assert.equal(pageCount(25, 10), 3)
})

test('pageSlice: returns the right window; a page past the end is empty', () => {
  const items = Array.from({ length: 25 }, (_, i) => i)
  assert.deepEqual(pageSlice(items, 1, 10), items.slice(0, 10))
  assert.deepEqual(pageSlice(items, 3, 10), [20, 21, 22, 23, 24])
  // A page past the end is empty.
  assert.deepEqual(pageSlice([1, 2, 3], 5, 10), [])
})
