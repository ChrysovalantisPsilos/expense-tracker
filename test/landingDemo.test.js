import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEMO_CURRENCY,
  buildTripDemo,
  budgetsDemo,
  insightsDemo,
  currencyDemo,
} from '../src/features/landing/landingDemo.js'
import { toBaseMinor, toMinor } from '../src/shared/lib/currency.js'

const sum = (xs) => xs.reduce((a, b) => a + b, 0)

test('buildTripDemo: shape and one step per expense', () => {
  const demo = buildTripDemo()
  assert.equal(demo.groupName, 'Lisbon weekend')
  assert.equal(demo.currency, DEMO_CURRENCY)
  assert.deepEqual(demo.members.map((m) => m.id), ['you', 'anna', 'marco', 'sofia'])
  assert.equal(demo.steps.length, demo.expenses.length)
  for (const e of demo.expenses) assert.ok(Number.isInteger(e.amountMinor))
})

test('buildTripDemo: totals accumulate and visible expenses grow', () => {
  const { expenses, steps } = buildTripDemo()
  steps.forEach((s, k) => {
    assert.deepEqual(s.expenses, expenses.slice(0, k + 1))
    assert.equal(s.totalMinor, sum(expenses.slice(0, k + 1).map((e) => e.amountMinor)))
  })
  assert.equal(steps.at(-1).totalMinor, 35700)
})

test('buildTripDemo: every step balances to zero', () => {
  for (const s of buildTripDemo().steps) {
    assert.equal(sum(s.balances.map((b) => b.netMinor)), 0)
  }
})

test('buildTripDemo: settlements settle the balances at every step', () => {
  const { steps, members } = buildTripDemo()
  const nameOf = new Map(members.map((m) => [m.id, m.name]))
  for (const s of steps) {
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

test('buildTripDemo: deterministic', () => {
  assert.deepEqual(buildTripDemo(), buildTripDemo())
})

test('budgetsDemo: pct is integer spent/cap and one is over budget', () => {
  const rows = budgetsDemo()
  assert.ok(rows.length >= 3 && rows.length <= 4)
  for (const r of rows) {
    assert.ok(Number.isInteger(r.spentMinor) && Number.isInteger(r.capMinor))
    assert.equal(r.pct, Math.round((r.spentMinor * 100) / r.capMinor))
  }
  assert.ok(rows.some((r) => r.pct > 100))
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
