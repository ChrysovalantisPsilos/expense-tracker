import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildTrend, hasTrendData, spendDelta, netWorth, spendingShares, foreignSpending, abroadCard,
} from '../src/features/insights/insightsMath.js'
import { axisTick } from '../src/shared/ui/chartAxis.js'
import { loadLanguage } from '../src/shared/lib/i18n/i18n.js'

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
    { label: 'Jan', income: 0, expense: 10, net: -10 },
    { label: 'Feb', income: 50, expense: 0, net: 50 },
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
  assert.deepEqual(netWorth(accounts), { assets: 1200, liabilities: 400, net: 800, showPot: false })
})

test('axisTick: compact labels that stay distinct between neighbouring ticks', () => {
  assert.deepEqual([0, 800, 1600, 2400, 3200].map(axisTick), ['0', '800', '1.6k', '2.4k', '3.2k'])
  assert.equal(axisTick(2000), '2k')
  assert.equal(axisTick(120000), '120k')
  assert.equal(axisTick(1500000), '1.5M')
  assert.equal(axisTick(250), '250')
})

test('axisTick in Greek: thousands and millions in Greek words', async () => {
  await loadLanguage('el')
  try {
    assert.deepEqual([0, 800, 1600, 3000].map(axisTick), ['0', '800', '1,6 χιλ.', '3 χιλ.'])
    assert.equal(axisTick(1500000), '1,5 εκ.')
  } finally {
    await loadLanguage('en')
  }
})

const tx = (o) => ({ kind: 'expense', exchange_rate: 1, currency: 'EUR', ...o })

test('spendingShares: the month\'s expenses by category, top 5 + Other, summing to 100', () => {
  const cat = (name) => ({ name })
  const rows = [
    tx({ spent_at: '2026-09-02', amount_minor: 58000, categories: cat('Housing') }),
    tx({ spent_at: '2026-09-03', amount_minor: 19000, categories: cat('Groceries') }),
    tx({ spent_at: '2026-09-04', amount_minor: 11000, categories: cat('Dining out') }),
    tx({ spent_at: '2026-09-05', amount_minor: 4000, categories: cat('Transport') }),
    tx({ spent_at: '2026-09-06', amount_minor: 3000, categories: cat('Health') }),
    tx({ spent_at: '2026-09-07', amount_minor: 3000, categories: cat('Gifts') }),
    tx({ spent_at: '2026-09-08', amount_minor: 2000, categories: cat('Books') }),
    tx({ spent_at: '2026-09-09', kind: 'income', amount_minor: 900000, categories: cat('Salary') }), // not spending
    tx({ spent_at: '2026-08-30', amount_minor: 900000, categories: cat('Housing') }), // last month
  ]
  const shares = spendingShares(rows, '2026-09', 'EUR')
  assert.deepEqual(shares.map((s) => s.label), ['Housing', 'Groceries', 'Dining out', 'Transport', 'Health', 'Other'])
  assert.equal(shares.reduce((sum, s) => sum + s.share, 0), 100)
  assert.equal(shares[0].share, 58)
  assert.equal(shares[5].share, 5) // Gifts + Books
  assert.equal(shares[5].folded, true)
  assert.ok(shares.slice(0, 5).every((s) => !('folded' in s)))
})

test('spendingShares: converts to base currency and buckets group shares under the group', () => {
  const rows = [
    tx({ spent_at: '2026-09-02', amount_minor: 1000, currency: 'GBP', exchange_rate: 1.5, categories: { name: 'Travel' } }),
    tx({ spent_at: '2026-09-03', amount_minor: 500, group_expense_id: 'g1', group_expenses: { groups: { name: 'Lisbon' } } }),
  ]
  assert.deepEqual(spendingShares(rows, '2026-09', 'EUR'), [
    { name: 'Travel', label: 'Travel', share: 75 }, { name: 'Lisbon', label: 'Lisbon', share: 25 },
  ])
  assert.deepEqual(spendingShares([], '2026-09', 'EUR'), [])
})

test('spendingShares: a real "Other" category that absorbs the tail still comes last', () => {
  const rows = [['Housing', 850], ['Groceries', 312], ['Food', 248], ['Other', 174], ['Trip', 89],
    ['Transport', 64], ['Fun', 48]].map(([name, v]) => tx({ spent_at: '2026-09-01', amount_minor: v, categories: { name } }))
  const shares = spendingShares(rows, '2026-09', 'EUR')
  assert.deepEqual(shares.map((s) => s.label), ['Housing', 'Groceries', 'Food', 'Trip', 'Other'])
  assert.equal(shares[4].share, 16) // 174 + 64 + 48 of 1785
})

test('foreignSpending: this month\'s foreign expenses converted at their captured rate (whole units for a zero-decimal base)', () => {
  const rows = [
    tx({ id: 1, spent_at: '2026-09-20', amount_minor: 4250, currency: 'GBP', exchange_rate: 1.17, description: 'Train to London' }),
    tx({ id: 2, spent_at: '2026-09-18', amount_minor: 18900, currency: 'USD', exchange_rate: 0.92, categories: { name: 'Hotels' } }),
    tx({ id: 3, spent_at: '2026-09-15', amount_minor: 1800, currency: 'JPY', exchange_rate: 0.0062, description: 'Ramen in Tokyo' }),
    tx({ id: 4, spent_at: '2026-09-14', amount_minor: 999, description: 'Coffee' }), // base currency
    tx({ id: 5, spent_at: '2026-09-13', amount_minor: 999, currency: 'USD', exchange_rate: null }), // no rate
    tx({ id: 6, spent_at: '2026-09-12', kind: 'income', amount_minor: 999, currency: 'USD', exchange_rate: 0.9 }),
    tx({ id: 7, spent_at: '2026-08-31', amount_minor: 999, currency: 'USD', exchange_rate: 0.9 }), // last month
  ]
  const { items, totalBaseMinor } = foreignSpending(rows, '2026-09', 'EUR')
  assert.deepEqual(items, [
    { id: 1, label: 'Train to London', currency: 'GBP', minor: 4250, rate: 1.17, baseMinor: 4973 },
    { id: 2, label: 'Hotels', currency: 'USD', minor: 18900, rate: 0.92, baseMinor: 17388 },
    { id: 3, label: 'Ramen in Tokyo', currency: 'JPY', minor: 1800, rate: 0.0062, baseMinor: 1116 },
  ])
  assert.equal(totalBaseMinor, 23477) // the landing card's €234.77
  assert.deepEqual(foreignSpending(rows.slice(3, 4), '2026-09', 'EUR'), { items: [], totalBaseMinor: 0 })
  // A zero-decimal base currency gets whole minor units.
  const hotel = [tx({ id: 1, spent_at: '2026-09-01', amount_minor: 1000, currency: 'EUR', exchange_rate: 160.5, description: 'Hotel' })]
  assert.equal(foreignSpending(hotel, '2026-09', 'JPY').totalBaseMinor, 1605)
})

test('hasTrendData: any income or spending in any month', () => {
  assert.equal(hasTrendData([]), false)
  assert.equal(hasTrendData(undefined), false)
  assert.equal(hasTrendData([{ label: 'Jan', income: 0, expense: 0 }, { label: 'Feb', income: 0, expense: 0 }]), false)
  assert.equal(hasTrendData([{ label: 'Jan', income: 0, expense: 12.5 }]), true)
  assert.equal(hasTrendData([{ label: 'Jan', income: 3250, expense: 0 }]), true)
})

import { incomeFigures, pickedMonthLabel, spendingBars, trendMoney } from '../src/features/insights/insightsMath.js'

test('trendMoney, spendingBars and incomeFigures word the trend', () => {
  assert.equal(trendMoney(1635, 'EUR'), '€1,635.00')
  assert.equal(trendMoney(12.345, 'EUR'), '€12.35')
  assert.equal(trendMoney(1800, 'JPY'), '¥1,800')
  const trend = [
    { label: 'Aug', income: 2500, expense: 1000, net: 1500 },
    { label: 'Sep', income: 2500, expense: 2750.5, net: -250.5 },
  ]
  const { aside, bars } = spendingBars(trend, 0, 'EUR')
  assert.equal(aside, 'Aug: €1,000.00')
  assert.deepEqual(bars[1], { label: 'Sep', value: 2750.5, ariaLabel: 'Sep: €2,750.50. Show this month' })
  assert.deepEqual(incomeFigures(trend, 'EUR'), {
    income: '€2,500.00', spent: '€2,750.50', net: { text: '−€250.50', tone: 'negative' }, delta: 175,
  })
})

test('pickedMonthLabel: this month, or the tapped one by name', () => {
  const ms = [{ key: '2025-12' }, { key: '2026-08' }, { key: '2026-09' }]
  const now = new Date(2026, 8, 20)
  assert.equal(pickedMonthLabel(ms, 2, now), 'This month')
  assert.equal(pickedMonthLabel(ms, 1, now), 'August')
  assert.equal(pickedMonthLabel(ms, 0, now), 'December 2025')
})

test('abroadCard: the first five payments worded, how many more, the total', () => {
  const item = (n) => ({ id: `t${n}`, label: `Lunch ${n}`, currency: 'USD', minor: 2400, rate: 0.8523, baseMinor: 2046 })
  const two = abroadCard({ items: [item(1), item(2)], totalBaseMinor: 4092 }, 'EUR')
  assert.equal(two.subtitle, 'This month, in EUR')
  const { from, ...first } = two.rows[0]
  assert.deepEqual(first, { id: 't1', label: 'Lunch 1', rate: '0.8523', to: '€20.46' })
  assert.match(from, /24\.00$/)
  assert.equal(two.more, null)
  assert.equal(two.total, '€40.92')
  const seven = abroadCard({ items: [1, 2, 3, 4, 5, 6, 7].map(item), totalBaseMinor: 7 * 2046 }, 'EUR')
  assert.equal(seven.rows.length, 5)
  assert.equal(seven.more, 'and 2 more, included in the total')
})
