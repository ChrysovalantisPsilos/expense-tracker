import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildTrend, spendDelta, netWorth, axisTick } from '../src/features/insights/insightsMath.js'

const months = [
  { key: '2026-01', label: 'Jan' },
  { key: '2026-02', label: 'Feb' },
]

test('buildTrend: buckets income/expense per month in major base units', () => {
  const rows = [
    { spent_at: '2026-01-10', kind: 'expense', amount_minor: 1000, exchange_rate: 1, currency: 'EUR' },
    { spent_at: '2026-02-05', kind: 'income', amount_minor: 5000, exchange_rate: 1, currency: 'EUR' },
    { spent_at: '2025-12-31', kind: 'expense', amount_minor: 9999, exchange_rate: 1, currency: 'EUR' }, // out of range
  ]
  const t = buildTrend(rows, months, 'EUR')
  assert.deepEqual(t, [
    { label: 'Jan', income: 0, expense: 10 },
    { label: 'Feb', income: 50, expense: 0 },
  ])
})

test('spendDelta: percent change vs previous month, null when not computable', () => {
  assert.equal(spendDelta([{ expense: 100 }, { expense: 150 }]), 50)
  assert.equal(spendDelta([{ expense: 200 }, { expense: 100 }]), -50)
  assert.equal(spendDelta([{ expense: 0 }, { expense: 100 }]), null) // prior month zero
  assert.equal(spendDelta([{ expense: 100 }]), null) // no prior month
})

test('netWorth: assets vs liabilities and the net', () => {
  const accounts = [
    { type: 'bank', balance_minor: 1000 },
    { type: 'liability', balance_minor: 400 },
    { type: 'savings', balance_minor: 200 },
  ]
  assert.deepEqual(netWorth(accounts), { assets: 1200, liabilities: 400, net: 800 })
})

test('axisTick: compact labels that stay distinct between neighbouring ticks', () => {
  assert.deepEqual([0, 800, 1600, 2400, 3200].map(axisTick), ['0', '800', '1.6k', '2.4k', '3.2k'])
  assert.equal(axisTick(2000), '2k')
  assert.equal(axisTick(120000), '120k')
  assert.equal(axisTick(1500000), '1.5M')
  assert.equal(axisTick(250), '250')
})
