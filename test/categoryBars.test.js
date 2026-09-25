import { test } from 'node:test'
import assert from 'node:assert/strict'
import { categoryBars } from '../src/features/dashboard/categoryBars.js'

test('categoryBars: sorted largest first, shares sum to 100, ratio vs largest', () => {
  const rows = categoryBars([{ name: 'Food', value: 300 }, { name: 'Rent', value: 900 }, { name: 'Fun', value: 100 }])
  assert.deepEqual(rows.map((r) => r.name), ['Rent', 'Food', 'Fun'])
  assert.equal(rows.reduce((s, r) => s + r.share, 0), 100)
  assert.deepEqual(rows.map((r) => r.ratio), [1, 300 / 900, 100 / 900])
})

test('categoryBars: long tail folds into Other; six items are left alone', () => {
  const cats = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((name, i) => ({ name, value: 70 - i * 10 }))
  const rows = categoryBars(cats)
  assert.deepEqual(rows.map((r) => r.name), ['A', 'B', 'C', 'D', 'E', 'Other'])
  assert.equal(rows.at(-1).value, 20 + 10)
  assert.equal(rows.at(-1).folded, true) // several buckets: no drill-down
  assert.ok(rows.slice(0, -1).every((r) => !r.folded))
  assert.equal(categoryBars(cats.slice(0, 6)).length, 6)
  assert.ok(categoryBars(cats.slice(0, 6)).every((r) => !r.folded))
})

test('categoryBars: an existing Other absorbs the tail; zero/empty input', () => {
  const cats = [{ name: 'Other', value: 500 }, ...['A', 'B', 'C', 'D', 'E', 'F'].map((name) => ({ name, value: 10 }))]
  const rows = categoryBars(cats)
  assert.equal(rows.filter((r) => r.name === 'Other').length, 1)
  assert.equal(rows.find((r) => r.name === 'Other').value, 520)
  assert.equal(rows.find((r) => r.name === 'Other').folded, true)
  assert.deepEqual(categoryBars([]), [])
  assert.deepEqual(categoryBars([{ name: 'X', value: 0 }]), [])
})

test('categoryBars: Other is always last, even when it outranks named categories', () => {
  const rows = categoryBars([{ name: 'Other', value: 500 }, { name: 'Rent', value: 900 }, { name: 'Food', value: 100 }])
  assert.deepEqual(rows.map((r) => r.name), ['Rent', 'Food', 'Other'])
  assert.equal(rows.reduce((s, r) => s + r.share, 0), 100)
  assert.equal(rows.at(-1).folded, undefined) // a real category, nothing folded in
})
