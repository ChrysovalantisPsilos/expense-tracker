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

test('categoryBars: a folded Other lists its members, largest first, adding up to it', () => {
  const cats = [
    { name: 'Rent', value: 90000 }, { name: 'Food', value: 30000 }, { name: 'Fun', value: 12000 },
    { name: 'Car', value: 9000 }, { name: 'Gym', value: 5000 },
    { name: 'Books', value: 1333 }, { name: 'Gifts', value: 2667 }, { name: 'Pets', value: 1000 },
  ]
  const rows = categoryBars(cats)
  const other = rows.at(-1)
  assert.equal(other.name, 'Other')
  assert.deepEqual(other.members.map((m) => m.name), ['Gifts', 'Books', 'Pets'])
  assert.equal(other.members.reduce((s, m) => s + m.value, 0), other.value)
  assert.equal(other.members.reduce((s, m) => s + m.share, 0), other.share)
  // Same bar scale as the rows: ratio vs the largest row (Rent).
  assert.deepEqual(other.members.map((m) => m.ratio), [2667 / 90000, 1333 / 90000, 1000 / 90000])
  assert.ok(other.members.every((m) => !m.folded && !m.members))
  assert.ok(rows.slice(0, -1).every((r) => !('members' in r)))
})

test('categoryBars: member shares split Other\'s integer share exactly (largest remainder)', () => {
  // Total 1000: Other = 10 × 10 → 10%, one point per member.
  const even = categoryBars([...'ABCDE'].map((name) => ({ name, value: 180 }))
    .concat([...'FGHIJKLMNO'].map((name) => ({ name, value: 10 })))).at(-1)
  assert.equal(even.share, 10)
  assert.deepEqual(even.members.map((m) => m.share), Array(10).fill(1))
  // Uneven: Other's 7% over 30/15/5 → 4.2/2.1/0.7 → 4/2/1 (leftover point to
  // the largest remainder), still summing to Other's share.
  const odd = categoryBars([...'ABCDE'].map((name) => ({ name, value: 130 }))
    .concat([{ name: 'X', value: 30 }, { name: 'Y', value: 15 }, { name: 'Z', value: 5 }]))
  const o = odd.at(-1)
  assert.equal(o.share, 7)
  assert.deepEqual(o.members.map((m) => m.share), [4, 2, 1])
  assert.equal(odd.reduce((s, r) => s + r.share, 0), 100)
})

test('categoryBars: a merged real Other is its own member, named Other', () => {
  const cats = [{ name: 'Other', value: 500 }, ...['A', 'B', 'C', 'D', 'E', 'F'].map((name, i) => ({ name, value: 60 - i }))]
  const other = categoryBars(cats).at(-1)
  assert.equal(other.value, 500 + 56 + 55)
  assert.deepEqual(other.members.map((m) => [m.name, m.value]), [['Other', 500], ['E', 56], ['F', 55]])
  assert.equal(other.members.reduce((s, m) => s + m.share, 0), other.share)
  // A real Other in the tail folds in like any other category.
  const tail = categoryBars([...'ABCDE'].map((name) => ({ name, value: 100 }))
    .concat([{ name: 'Other', value: 20 }, { name: 'Z', value: 30 }]))
  assert.equal(tail.filter((r) => r.name === 'Other').length, 1)
  assert.deepEqual(tail.at(-1).members.map((m) => m.name), ['Z', 'Other'])
})

test('categoryBars: no fold (six or fewer categories), no members', () => {
  const cats = [...'ABCDEF'].map((name, i) => ({ name, value: 60 - i }))
  assert.ok(categoryBars(cats).every((r) => !('members' in r) && !r.folded))
  assert.ok(categoryBars([{ name: 'Other', value: 5 }]).every((r) => !('members' in r)))
})
