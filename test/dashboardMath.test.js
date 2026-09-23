import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  periodTotals, periodProjection, projectedTotals,
} from '../src/features/dashboard/dashboardMath.js'

const rows = [
  { id: 1, kind: 'expense', amount_minor: 1000, currency: 'EUR', exchange_rate: 1, categories: { name: 'Food' } },
  { id: 2, kind: 'expense', amount_minor: 2000, currency: 'GBP', exchange_rate: 1.15, categories: { name: 'Travel' } },
  { id: 3, kind: 'income', amount_minor: 50000, currency: 'EUR', exchange_rate: 1, categories: { name: 'Salary' } },
  { id: 4, kind: 'expense', amount_minor: 500, currency: 'EUR', exchange_rate: 1, categories: { name: 'Food' } },
  { id: 5, kind: 'expense', amount_minor: 1200, currency: 'EUR', exchange_rate: 1, group_expense_id: 'g1',
    group_expenses: { groups: { name: 'Italy' } } },
]

test('periodTotals: base-currency spent/earned and a largest-first category breakdown', () => {
  const t = periodTotals(rows, 'EUR')
  assert.equal(t.spent, 1000 + 2300 + 500 + 1200)
  assert.equal(t.earned, 50000)
  assert.deepEqual(t.byCategory, [
    { name: 'Travel', value: 2300 }, { name: 'Food', value: 1500 }, { name: 'Italy', value: 1200 },
  ])
  assert.equal(t.bucketRow.get('Food').id, 1) // the first row seen in a bucket
  assert.equal(t.bucketRow.get('Italy').id, 5) // group expenses bucket by group
})

test('periodTotals: no rows, all zero', () => {
  const t = periodTotals([], 'EUR')
  assert.deepEqual([t.spent, t.earned, t.byCategory], [0, 0, []])
})

const rules = [
  { is_active: true, kind: 'expense', amount_minor: 999, frequency: 'monthly', interval_n: 1, next_run: '2026-09-25' },
  { is_active: true, kind: 'income', amount_minor: 10000, frequency: 'monthly', interval_n: 1, next_run: '2026-09-28' },
  { is_active: false, kind: 'expense', amount_minor: 5000, frequency: 'monthly', interval_n: 1, next_run: '2026-09-24' },
]

test('periodProjection: only ongoing periods fold in upcoming recurring', () => {
  assert.deepEqual(periodProjection(rules, '2026-09-30', '2026-09-23'), { expense: 999, income: 10000 })
  assert.deepEqual(periodProjection(rules, '2026-08-31', '2026-09-23'), { expense: 0, income: 0 }) // past
  assert.deepEqual(periodProjection(rules, null, '2026-09-23'), { expense: 0, income: 0 }) // all time
})

test('projectedTotals adds the projection and nets income − spend', () => {
  assert.deepEqual(projectedTotals({ spent: 3000, earned: 1000 }, { expense: 500, income: 200 }),
    { spentTotal: 3500, earnedTotal: 1200, netTotal: -2300 })
})

// ---- Yearly subscriptions kept separate (0068) -------------------------------
const withYearly = [
  ...rules,
  { is_active: true, kind: 'expense', amount_minor: 12000, frequency: 'yearly', interval_n: 1, next_run: '2026-09-27' },
]

test('periodProjection: separateYearly leaves yearly rules out', () => {
  assert.deepEqual(periodProjection(withYearly, '2026-09-30', '2026-09-23'), { expense: 999 + 1000, income: 10000 })
  assert.deepEqual(periodProjection(withYearly, '2026-09-30', '2026-09-23', true), { expense: 999, income: 10000 })
})
