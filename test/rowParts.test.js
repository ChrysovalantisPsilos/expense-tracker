import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rowParts } from '../src/features/transactions/rowParts.js'
import { ledgerSummary } from '../src/features/transactions/listHeading.js'
import { salaryShiftOf } from '../src/shared/lib/salaryShift.js'
import { loadLanguage } from '../src/shared/lib/i18n/i18n.js'

const cat = (id, name, kind = 'expense', extra = {}) => ({ id, name, kind, icon: null, color: null, ...extra })
const row = (extra = {}) => ({
  id: 'r1', kind: 'expense', spent_at: '2020-09-14', amount_minor: 1250, currency: 'EUR', exchange_rate: 1,
  category_id: 'c1', categories: cat('c1', 'Groceries'), description: null, notes: null, group_expense_id: null,
  recurring: null, spread_months: null, savings_from_income: null, paid_from_savings: false, paid_with_vouchers: false,
  ...extra,
})
const opts = { kind: 'expense', baseCurrency: 'EUR' }

test('rowParts: a plain expense is named by its category, amount unsigned', () => {
  const p = rowParts(row(), opts)
  assert.equal(p.title, 'Groceries')
  assert.deepEqual(p.meta, ['14 Sep 2020'])
  assert.equal(p.amount, '€12.50')
  assert.equal(p.tone, 'default')
  assert.equal(p.kind, 'expense')
  assert.equal(p.shared, false)
  assert.deepEqual(p.look, { key: 'groceries', tone: 'accent', tint: null })
  for (const k of ['notes', 'group', 'repeats', 'spread', 'countsFor', 'approx', 'rate', 'estimated']) assert.equal(p[k], null, k)
})

test('rowParts: a description names it and moves the category into the line; notes; income with a plus', () => {
  const p = rowParts(row({ description: 'Market', notes: 'weekly' }), opts)
  assert.equal(p.title, 'Market')
  assert.deepEqual(p.meta, ['14 Sep 2020', 'Groceries'])
  assert.equal(p.notes, 'weekly')
  const pay = rowParts(row({ kind: 'income', categories: cat('c2', 'Salary', 'income') }), { ...opts, kind: undefined })
  assert.equal(pay.amount, '+€12.50')
  assert.equal(pay.tone, 'positive')
  assert.equal(pay.look.tone, 'positive')
  // No category and no description: the kind's name.
  assert.equal(rowParts(row({ categories: null, category_id: null }), opts).title, 'Expense')
})

test('rowParts: a foreign amount, estimated; a group share; a rule; a yearly payment', () => {
  const usd = rowParts(row({ currency: 'USD', exchange_rate: 0.9, rate_estimated: true }), opts)
  assert.equal(usd.amount, '$12.50')
  assert.equal(usd.approx, '≈ €11.25')
  assert.equal(usd.rate, '0.9')
  assert.equal(usd.estimated, 'est.')
  const shared = rowParts(row({ group_expense_id: 'g1', group_expenses: { groups: { name: 'Lisbon trip' } } }), opts)
  assert.equal(shared.shared, true)
  assert.equal(shared.group, 'Lisbon trip')
  const rule = rowParts(row({ recurring: { frequency: 'monthly', interval_n: 1, is_active: false } }), opts)
  assert.equal(rule.repeats, 'Repeats every month (paused)')
  const yearly = rowParts(row({ amount_minor: 9600, spread_months: 12 }), opts)
  assert.equal(yearly.spread, '€8.00/month over 12 months')
  assert.equal(rowParts(row({ amount_minor: 1000, spread_months: 12 }), opts).spread, '≈ €0.84/month over 12 months')
})

test('rowParts: savings notes and a late salary counted next month', async () => {
  const saved = rowParts(row({ kind: 'income', category_id: 'sav', categories: cat('sav', 'Savings', 'income'), savings_from_income: true }),
    { ...opts, savingsIds: new Set(['sav']) })
  assert.deepEqual(saved.meta, ['14 Sep 2020', 'from income'])
  const shift = salaryShiftOf({ salary_shift_from_day: 25, salary_category_id: 'pay' })
  const late = rowParts(row({ kind: 'income', spent_at: '2020-09-28', category_id: 'pay', categories: cat('pay', 'Salary', 'income') }),
    { ...opts, salaryShift: shift })
  assert.equal(late.countsFor, 'Counts for October')
  await loadLanguage('el')
  try {
    assert.equal(rowParts(row(), opts).meta[0], '14 Σεπ 2020')
  } finally {
    await loadLanguage('en')
  }
})

test('ledgerSummary: a loaded search adds its net', () => {
  assert.equal(ledgerSummary('This month · 3 entries', { searching: false, count: 3, net: -500, baseCurrency: 'EUR' }),
    'This month · 3 entries')
  assert.equal(ledgerSummary('3 results', { searching: true, count: 3, net: -500, baseCurrency: 'EUR' }),
    '3 results · Net −€5.00')
  assert.equal(ledgerSummary('', { searching: true, loading: true, count: 3, net: -500, baseCurrency: 'EUR' }), '')
  assert.equal(ledgerSummary('0 results', { searching: true, count: 0, net: 0, baseCurrency: 'EUR' }), '0 results')
})
