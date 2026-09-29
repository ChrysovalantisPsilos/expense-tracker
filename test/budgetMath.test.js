import { test } from 'node:test'
import assert from 'node:assert/strict'
import { budgetChange, budgetPercent, budgetTone } from '../src/features/budgets/budgetMath.js'

test('budgetTone: under 80% of the cap keeps the default fill', () => {
  assert.equal(budgetTone(0, 10000), undefined)
  assert.equal(budgetTone(7999, 10000), undefined)
})

test('budgetTone: from 80% up to the cap warns', () => {
  assert.equal(budgetTone(8000, 10000), 'warning')
  assert.equal(budgetTone(10000, 10000), 'warning')
})

test('budgetTone: any spend over the cap is negative', () => {
  assert.equal(budgetTone(10001, 10000), 'negative')
  assert.equal(budgetTone(1, 0), 'negative')
})

test('budgetTone: a zero cap with no spend is neutral', () => {
  assert.equal(budgetTone(0, 0), undefined)
})

test('budgetPercent: whole percent of the cap, unclamped', () => {
  assert.equal(budgetPercent(31240, 40000), 78)
  assert.equal(budgetPercent(18690, 15000), 125)
  assert.equal(budgetPercent(0, 10000), 0)
  assert.equal(budgetPercent(333, 1000), 33)
})

test('budgetPercent: a zero cap reads 0 (over-budget comes from budgetTone)', () => {
  assert.equal(budgetPercent(500, 0), 0)
  assert.equal(budgetPercent(0, 0), 0)
})

// ---- Rollover ---------------------------------------------------------------
import { previousPeriod, carriedFrom, carriedLabel } from '../src/features/budgets/budgetMath.js'

test('previousPeriod: the month before, across a year boundary', () => {
  assert.equal(previousPeriod('2026-09-01'), '2026-08-01')
  assert.equal(previousPeriod('2026-01-01'), '2025-12-01')
  assert.equal(previousPeriod('2026-10-01'), '2026-09-01')
})

test('carriedFrom: rows from an earlier month are carried; own rows or none are not', () => {
  assert.equal(carriedFrom([{ period_start: '2026-08-01' }, { period_start: '2026-08-01' }], '2026-09-01'), '2026-08-01')
  assert.equal(carriedFrom([{ period_start: '2026-09-01' }], '2026-09-01'), null)
  assert.equal(carriedFrom([], '2026-09-01'), null)
  assert.equal(carriedFrom(undefined, '2026-09-01'), null)
})

test('carriedLabel: month name, with the year only when it differs', () => {
  assert.equal(carriedLabel('2026-08-01', '2026-09-01', 'en-GB'), 'Carried over from August')
  assert.equal(carriedLabel('2025-12-01', '2026-01-01', 'en-GB'), 'Carried over from December 2025')
})

test('budgetChange: set, change, remove or nothing to do', () => {
  assert.deepEqual(budgetChange(null, '400', 'EUR'), { set: 40000 })
  assert.deepEqual(budgetChange(40000, '412.5', 'EUR'), { set: 41250 })
  assert.equal(budgetChange(40000, '400.00', 'EUR'), null) // same cap
  assert.deepEqual(budgetChange(40000, '', 'EUR'), { remove: true })
  assert.deepEqual(budgetChange(40000, '  ', 'EUR'), { remove: true })
  assert.equal(budgetChange(null, '', 'EUR'), null) // still no budget
  assert.equal(budgetChange(null, '.', 'EUR'), null) // unreadable
  assert.deepEqual(budgetChange(null, '0', 'EUR'), { set: 0 }) // a zero cap is a cap
  assert.deepEqual(budgetChange(null, '5000', 'JPY'), { set: 5000 }) // zero-decimal currency
})

// ---- A period's budgets (Home's card follows the period picker) --------------
import {
  budgetWindow, capsInMonth, periodBudgets, budgetSubtitle, budgetsEmpty, isRelativeLabel,
} from '../src/features/budgets/budgetMath.js'
import { periodFromValue } from '../src/shared/lib/periods.js'
import { loadLanguage } from '../src/shared/lib/i18n/i18n.js'

const NOW = new Date(2026, 8, 25) // 25 Sep 2026
const TODAY = '2026-09-25'
const P = (v) => periodFromValue(v, NOW)
const GRO = { name: 'Groceries' }
const cap = (period, category_id, amount_minor, categories = { name: category_id }) =>
  ({ id: `${period}:${category_id}`, category_id, amount_minor, currency: 'EUR', period_start: period, categories })
const spent = (spent_at, category_id, amount_minor, extra = {}) =>
  ({ kind: 'expense', spent_at, category_id, amount_minor, currency: 'EUR', exchange_rate: 1, ...extra })

// Budgets set in Nov 2024 (groceries 300), changed in Mar 2025 (groceries 250
// + fun 100), fun deleted from Jul 2025 (its own set), all carried since.
const SETS = [
  { period: '2024-11-01', rows: [cap('2024-11-01', 'gro', 30000, GRO)] },
  { period: '2025-03-01', rows: [cap('2025-03-01', 'gro', 25000, GRO), cap('2025-03-01', 'fun', 10000)] },
  { period: '2025-07-01', rows: [cap('2025-07-01', 'gro', 25000, GRO)] },
]
const run = (value, spend, sets = SETS, baseCurrency = 'EUR') =>
  periodBudgets({ sets, span: budgetWindow(P(value), TODAY), spend, baseCurrency })
const byId = (items) => Object.fromEntries(items.map((i) => [i.id, i]))

test('budgetWindow: a month is itself; the current year stops at this month; all time from the start', () => {
  assert.deepEqual(budgetWindow(P('m:2025-2'), TODAY),
    { first: '2025-02-01', last: '2025-02-01', from: '2025-02-01', to: '2025-02-28' })
  assert.deepEqual(budgetWindow(P('y:2026'), TODAY),
    { first: '2026-01-01', last: '2026-09-01', from: '2026-01-01', to: '2026-09-30' })
  assert.deepEqual(budgetWindow(P('y:2025'), TODAY),
    { first: '2025-01-01', last: '2025-12-01', from: '2025-01-01', to: '2025-12-31' })
  assert.deepEqual(budgetWindow(P('all'), TODAY),
    { first: null, last: '2026-09-01', from: null, to: '2026-09-30' })
})

test('capsInMonth: the latest set at or before the month (rollover); none before the first', () => {
  assert.deepEqual(capsInMonth(SETS, '2024-10-01'), [])
  assert.equal(capsInMonth(SETS, '2025-01-01')[0].amount_minor, 30000)
  assert.equal(capsInMonth(SETS, '2025-03-01').length, 2)
  assert.deepEqual(capsInMonth(SETS, '2026-09-01').map((b) => b.category_id), ['gro'])
})

test('periodBudgets: a month is its own caps against its own spend', () => {
  const { items, months } = run('m:2025-4', [
    spent('2025-04-02', 'gro', 12000), spent('2025-04-20', 'gro', 11000),
    spent('2025-03-31', 'gro', 99999), spent('2025-04-10', 'fun', 12000), spent('2025-04-11', null, 5000),
  ])
  assert.equal(months, 1)
  const i = byId(items)
  assert.deepEqual([i.gro.limit, i.gro.spent, i.gro.tone, i.gro.name], [25000, 23000, 'warning', 'Groceries'])
  assert.deepEqual([i.fun.limit, i.fun.spent, i.fun.tone], [10000, 12000, 'negative'])
  assert.equal(items[0].id, 'fun') // most used first
})

test('periodBudgets: a month with no caps of its own uses the carried-over ones', () => {
  const { items } = run('m:2025-1', [spent('2025-01-05', 'gro', 1000)])
  assert.deepEqual(items.map((i) => [i.id, i.limit, i.spent]), [['gro', 30000, 1000]])
  assert.deepEqual(run('m:2024-10', [spent('2024-10-05', 'gro', 1000)]).items, [])
})

test('periodBudgets: a past year adds up all 12 months (carry-over included)', () => {
  const spend = [spent('2025-01-10', 'gro', 20000), spent('2025-12-10', 'gro', 30000), spent('2024-12-31', 'gro', 777)]
  const { items, months } = run('y:2025', spend)
  assert.equal(months, 12)
  const i = byId(items)
  // Jan–Feb carry Nov 2024's 300, Mar–Dec have 250.
  assert.equal(i.gro.limit, 2 * 30000 + 10 * 25000)
  assert.equal(i.gro.spent, 50000)
  assert.equal(i.gro.months, 12)
})

test('periodBudgets: a category capped in only some months counts only those months', () => {
  const spend = [spent('2025-02-10', 'fun', 5000), spent('2025-05-10', 'fun', 4000), spent('2025-08-10', 'fun', 9000)]
  const fun = byId(run('y:2025', spend).items).fun
  // Capped Mar–Jun (4 months); Feb and Aug spend isn't set against anything.
  assert.deepEqual([fun.limit, fun.spent, fun.months], [40000, 4000, 4])
})

test('periodBudgets: the current year counts January to this month, not the months to come', () => {
  const spend = [spent('2026-09-24', 'gro', 10000), spent('2026-10-01', 'gro', 5000)]
  const { items, months } = run('y:2026', spend)
  assert.equal(months, 9)
  assert.deepEqual([items[0].limit, items[0].spent], [9 * 25000, 10000])
})

test('periodBudgets: all time runs from the first month with budgets to this month', () => {
  const { items, months } = run('all', [spent('2024-06-01', 'gro', 5000), spent('2024-11-15', 'gro', 5000)])
  // Nov 2024 → Sep 2026 = 23 months; June 2024 had no budget.
  assert.equal(months, 23)
  const i = byId(items)
  assert.equal(i.gro.limit, 4 * 30000 + 19 * 25000)
  assert.equal(i.gro.spent, 5000)
  assert.equal(i.fun.limit, 4 * 10000)
  assert.deepEqual(run('all', [], []), { items: [], months: 0 })
})

test('periodBudgets: a zero-decimal base stays whole; foreign spend converts at its rate', () => {
  const sets = [{ period: '2026-01-01', rows: [cap('2026-01-01', 'gro', 30000, GRO)] }]
  const spend = [spent('2026-02-03', 'gro', 12345, { currency: 'JPY' }),
    spent('2026-02-04', 'gro', 1000, { currency: 'EUR', exchange_rate: 160 })] // €10.00 → ¥1600
  const { items } = run('y:2026', spend, sets, 'JPY')
  assert.equal(items[0].limit, 9 * 30000)
  assert.equal(items[0].spent, 12345 + 1600)
  assert.ok(Number.isInteger(items[0].spent))
})

test('budgetSubtitle: month name (with carry-over), or a longer period with its month count', () => {
  assert.equal(budgetSubtitle(P('m:2026-9')), 'This month')
  assert.equal(budgetSubtitle(P('m:2026-9'), { carried: '2026-08-01', periodStart: '2026-09-01' }),
    'Carried over from August')
  assert.equal(budgetSubtitle(P('m:2025-3'), { carried: '2025-01-01', periodStart: '2025-03-01' }),
    'March 2025 · Carried over from January')
  assert.equal(budgetSubtitle(P('m:2025-3')), 'March 2025')
  assert.equal(budgetSubtitle(P('y:2025'), { months: 12 }), '2025 · 12 months')
  assert.equal(budgetSubtitle(P('y:2026'), { months: 1 }), 'This year · 1 month')
  assert.equal(budgetSubtitle(P('all'), { months: 0 }), 'All time')
})

test('budgetsEmpty: past periods just say so; only periods with this month offer to set one', () => {
  assert.deepEqual(budgetsEmpty(P('y:2025'), false), { text: 'No budgets in 2025.', canSet: false })
  assert.deepEqual(budgetsEmpty(P('m:2025-3'), false), { text: 'No budgets in March 2025.', canSet: false })
  assert.equal(budgetsEmpty(P('y:2026'), true).canSet, true)
  assert.match(budgetsEmpty(P('y:2026'), true).text, /^No budgets this year\./)
  assert.match(budgetsEmpty(P('m:2026-9'), true).text, /^No budgets yet\./)
})

test('isRelativeLabel: "This month" / "This year" name a period from today, in any language', () => {
  assert.equal(isRelativeLabel(P('m:2026-9')), true)
  assert.equal(isRelativeLabel(P('y:2026')), true)
  assert.equal(isRelativeLabel(P('m:2025-3')), false)
  assert.equal(isRelativeLabel(P('y:2025')), false)
  assert.equal(isRelativeLabel(P('all')), false)
  assert.equal(isRelativeLabel({ ...P('m:2026-9'), label: 'Αυτός ο μήνας' }), true)
})

test('budget labels in Greek: the month in its genitive, a plural for months', async () => {
  await loadLanguage('el')
  try {
    assert.equal(carriedLabel('2026-08-01', '2026-09-01', 'el-GR'), 'Ίδια όρια με του Αυγούστου')
    assert.equal(carriedLabel('2025-12-01', '2026-01-01', 'el-GR'), 'Ίδια όρια με του Δεκεμβρίου 2025')
    assert.equal(budgetSubtitle(P('y:2025'), { months: 12 }), '2025 · 12 μήνες')
    assert.equal(budgetSubtitle(P('y:2025'), { months: 1 }), '2025 · 1 μήνας')
    assert.deepEqual(budgetsEmpty(P('m:2025-3'), false), { text: 'Χωρίς προϋπολογισμούς: Μάρτιος 2025.', canSet: false })
  } finally {
    await loadLanguage('en')
  }
})
