import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEMO_CURRENCY,
  buildTripDemo,
  budgetsDemo,
  insightsDemo,
  currencyDemo,
  splitDemo,
  settleDemo,
} from '../src/features/landing/landingDemo.js'
import { toBaseMinor, toMinor } from '../src/shared/lib/currency.js'

const sum = (xs) => xs.reduce((a, b) => a + b, 0)

test('buildTripDemo: shape and one step per expense, deterministic', () => {
  const demo = buildTripDemo()
  assert.equal(demo.groupName, 'Lisbon weekend')
  assert.equal(demo.currency, DEMO_CURRENCY)
  assert.deepEqual(demo.members.map((m) => m.id), ['you', 'anna', 'marco', 'sofia'])
  assert.equal(demo.steps.length, demo.expenses.length)
  for (const e of demo.expenses) assert.ok(Number.isInteger(e.amountMinor))
  // Deterministic.
  assert.deepEqual(buildTripDemo(), buildTripDemo())
})

test('buildTripDemo: totals accumulate and visible expenses grow', () => {
  const { expenses, steps } = buildTripDemo()
  steps.forEach((s, k) => {
    assert.deepEqual(s.expenses, expenses.slice(0, k + 1))
    assert.equal(s.totalMinor, sum(expenses.slice(0, k + 1).map((e) => e.amountMinor)))
  })
  assert.equal(steps.at(-1).totalMinor, 35700)
})

test('buildTripDemo: every step balances to zero, and its settlements settle the balances', () => {
  const { steps, members } = buildTripDemo()
  const nameOf = new Map(members.map((m) => [m.id, m.name]))
  for (const s of steps) {
    assert.equal(sum(s.balances.map((b) => b.netMinor)), 0)
    const after = new Map(s.balances.map((b) => [b.id, b.netMinor]))
    for (const t of s.settlements) {
      assert.ok(t.amountMinor > 0)
      assert.equal(t.fromName, nameOf.get(t.from))
      assert.equal(t.toName, nameOf.get(t.to))
      after.set(t.from, after.get(t.from) + t.amountMinor)
      after.set(t.to, after.get(t.to) - t.amountMinor)
    }
    for (const v of after.values()) assert.equal(v, 0)
    assert.ok(s.settlements.length <= members.length - 1)
  }
})

test('budgetsDemo: pct is integer spent/cap and one is over budget', () => {
  const rows = budgetsDemo()
  assert.ok(rows.length >= 3 && rows.length <= 4)
  for (const r of rows) {
    assert.ok(Number.isInteger(r.spentMinor) && Number.isInteger(r.capMinor))
    assert.equal(r.pct, Math.round((r.spentMinor * 100) / r.capMinor))
  }
  assert.ok(rows.some((r) => r.pct > 100))
  // Real category names, the app's order (most used first) and bar colours.
  assert.deepEqual(rows.map((r) => r.category), ['Food & Dining', 'Groceries', 'Entertainment', 'Transport'])
  assert.deepEqual(rows.map((r) => r.tone), ['negative', 'warning', undefined, undefined])
})

test('insightsDemo: shares sum to exactly 100 and trend has 6 months', () => {
  const { byCategory, trend } = insightsDemo()
  assert.equal(sum(byCategory.map((c) => c.share)), 100)
  for (const c of byCategory) assert.ok(Number.isInteger(c.minor) && Number.isInteger(c.share))
  assert.deepEqual(trend.map((t) => t.month), ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'])
  for (const t of trend) assert.ok(Number.isInteger(t.minor))
})

test('currencyDemo: rows use toBaseMinor, JPY is zero-decimal, total matches', () => {
  const { base, rows, totalBaseMinor } = currencyDemo()
  assert.equal(base, 'EUR')
  for (const c of ['GBP', 'USD', 'JPY']) assert.ok(rows.some((r) => r.currency === c))
  for (const r of rows) {
    assert.equal(r.baseMinor, toBaseMinor(r.minor, r.rate, r.currency, 'EUR'))
  }
  const jpy = rows.find((r) => r.currency === 'JPY')
  assert.equal(jpy.minor, toMinor(1800, 'JPY'))
  assert.equal(jpy.minor, 1800)
  assert.equal(jpy.baseMinor, 1116) // ¥1800 × 0.0062 = €11.16
  assert.equal(totalBaseMinor, sum(rows.map((r) => r.baseMinor)))
})

test('splitDemo: equal shares that add up to the expense', () => {
  const d = splitDemo()
  assert.equal(d.members.length, 4)
  assert.equal(sum(d.members.map((m) => m.shareMinor)), d.amountMinor)
  assert.ok(d.members.every((m) => Number.isInteger(m.shareMinor)))
  assert.equal(d.members[0].shareMinor, 1460) // €58.40 / 4
})

test('settleDemo: one frame per payment, balances conserved, ending at zero', () => {
  const { payments, frames } = settleDemo()
  const trip = buildTripDemo().steps.at(-1)
  assert.equal(frames.length, payments.length + 1)
  assert.deepEqual(frames[0], trip.balances)
  for (const f of frames) assert.equal(sum(f.map((b) => b.netMinor)), 0)
  assert.ok(frames.at(-1).every((b) => b.netMinor === 0))
  assert.ok(payments.length >= 2 && payments.length <= 3)
})
