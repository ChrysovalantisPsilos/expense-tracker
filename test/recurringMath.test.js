import { test } from 'node:test'
import assert from 'node:assert/strict'
import { monthlyMinor, frequencyLabel, expectedInWindow } from '../src/features/recurring/recurringMath.js'

test('monthlyMinor: monthly is itself', () => {
  assert.equal(monthlyMinor({ amount_minor: 1000, frequency: 'monthly', interval_n: 1 }), 1000)
})

test('monthlyMinor: weekly scales by 52/12', () => {
  assert.equal(monthlyMinor({ amount_minor: 1200, frequency: 'weekly', interval_n: 1 }), Math.round(1200 * 52 / 12))
})

test('monthlyMinor: every 2 months halves', () => {
  assert.equal(monthlyMinor({ amount_minor: 1000, frequency: 'monthly', interval_n: 2 }), 500)
})

test('frequencyLabel wording', () => {
  assert.equal(frequencyLabel({ frequency: 'monthly' }), 'every month')
  assert.equal(frequencyLabel({ frequency: 'weekly', interval_n: 2 }), 'every 2 weeks')
})

test('expectedInWindow: counts occurrences inside the window only', () => {
  const rules = [{
    is_active: true, kind: 'expense', amount_minor: 500,
    frequency: 'weekly', interval_n: 1, next_run: '2026-07-10', end_date: null,
  }]
  // Window 2026-07-01..31 → 10, 17, 24, 31 = 4 charges.
  assert.deepEqual(expectedInWindow(rules, '2026-07-01', '2026-07-31'), { expense: 2000, income: 0 })
})

test('expectedInWindow: no double count for already-materialised charges', () => {
  // next_run already advanced past the whole window → nothing projected.
  const rules = [{
    is_active: true, kind: 'expense', amount_minor: 500,
    frequency: 'monthly', interval_n: 1, next_run: '2026-08-01', end_date: null,
  }]
  assert.deepEqual(expectedInWindow(rules, '2026-07-01', '2026-07-31'), { expense: 0, income: 0 })
})

test('expectedInWindow: respects end_date and inactive rules', () => {
  const rules = [
    { is_active: true, kind: 'expense', amount_minor: 100, frequency: 'daily', interval_n: 1, next_run: '2026-07-01', end_date: '2026-07-03' },
    { is_active: false, kind: 'expense', amount_minor: 999, frequency: 'daily', interval_n: 1, next_run: '2026-07-01', end_date: null },
  ]
  // 3 charges (1st..3rd), inactive ignored.
  assert.deepEqual(expectedInWindow(rules, '2026-07-01', '2026-07-31'), { expense: 300, income: 0 })
})

test('expectedInWindow: income vs expense split', () => {
  const rules = [
    { is_active: true, kind: 'income', amount_minor: 200000, frequency: 'monthly', interval_n: 1, next_run: '2026-07-28', end_date: null },
    { is_active: true, kind: 'expense', amount_minor: 800, frequency: 'monthly', interval_n: 1, next_run: '2026-07-20', end_date: null },
  ]
  assert.deepEqual(expectedInWindow(rules, '2026-07-15', '2026-07-31'), { expense: 800, income: 200000 })
})
