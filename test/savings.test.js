// Savings entries (0084): income in a category marked as savings is never
// income, and one "taken from my income" lowers the net. The shared helper
// (supabase/functions/_shared/savings.ts, re-exported by src/shared/lib/
// savings.js) and every sum that uses it: Home's totals, net and projection,
// the "Saved" note, Insights' trend and net worth, the ledger's net, the
// Recurring page's income per month and the statement.
// Node strips the TypeScript types.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  savingsIdsOf, isSavingsRow, rowEffect, savingsSource, netSign, withoutSavings, savedMinor,
} from '../src/shared/lib/savings.js'
import { formatMoney } from '../src/shared/lib/currency.js'
import { spendRows } from '../src/shared/lib/spread.js'
import {
  periodTotals, periodProjection, projectedTotals, netNote, savedNote,
} from '../src/features/dashboard/dashboardMath.js'
import { buildTrend, netWorth } from '../src/features/insights/insightsMath.js'
import { netBaseMinor } from '../src/features/transactions/txnFilter.js'
import { incomePerMonth, planRepeat, repeatDraft, ruleFromTransaction } from '../src/features/recurring/recurringMath.js'
import { periodFromValue } from '../src/features/transactions/periods.js'
import {
  buildStatement, savingsNote, statementSheets,
} from '../supabase/functions/generate-report/statementMath.ts'

const SAV = 'cat-savings'
const IDS = new Set([SAV])
const row = (o) => ({
  kind: 'expense', amount_minor: 1000, currency: 'EUR', exchange_rate: 1, spent_at: '2026-09-10', ...o,
})
// September: €2,000 salary, €300 set aside from it, £100 interest received
// into savings at 1.2 (€120), €450 of spending.
const rows = [
  row({ id: 'sal', kind: 'income', category_id: 'cat-salary', amount_minor: 200000, categories: { name: 'Salary' } }),
  row({ id: 'put', kind: 'income', category_id: SAV, amount_minor: 30000, savings_from_income: true,
    categories: { name: 'Savings' } }),
  row({ id: 'int', kind: 'income', category_id: SAV, amount_minor: 10000, currency: 'GBP', exchange_rate: 1.2,
    savings_from_income: false, categories: { name: 'Savings' } }),
  row({ id: 'food', category_id: 'cat-food', amount_minor: 45000, categories: { name: 'Food' } }),
]

test('savingsIdsOf: income categories marked as savings, archived included', () => {
  const ids = savingsIdsOf([
    { id: 'a', kind: 'income', is_savings: true },
    { id: 'b', kind: 'income', is_savings: true, is_archived: true },
    { id: 'c', kind: 'income', is_savings: false },
    { id: 'd', kind: 'income' },
    { id: 'e', kind: 'expense', is_savings: true }, // the CHECK forbids it; never trusted
  ])
  assert.deepEqual([...ids].sort(), ['a', 'b'])
  assert.equal(savingsIdsOf(null).size, 0)
})

test('rowEffect: income, expense, savings taken from income, savings received', () => {
  assert.equal(rowEffect(rows[0], IDS), 'income')
  assert.equal(rowEffect(rows[1], IDS), 'saved-from-income')
  assert.equal(rowEffect(rows[2], IDS), 'saved-received')
  assert.equal(rowEffect(rows[3], IDS), 'expense')
  // No flag (an older row, an import) is money received.
  assert.equal(rowEffect(row({ kind: 'income', category_id: SAV }), IDS), 'saved-received')
  // The flag means nothing outside a savings category, or on an expense.
  assert.equal(rowEffect(row({ kind: 'income', category_id: 'cat-salary', savings_from_income: true }), IDS), 'income')
  assert.equal(rowEffect(row({ category_id: SAV, savings_from_income: true }), IDS), 'expense')
  assert.equal(rowEffect(row({ kind: 'income', category_id: null }), IDS), 'income')
  // Without savings categories, income is income.
  assert.equal(rowEffect(rows[1], new Set()), 'income')
  // How each moves the net.
  assert.deepEqual(['income', 'expense', 'saved-from-income', 'saved-received'].map(netSign), [1, -1, -1, 0])
  assert.deepEqual(rows.map((r) => savingsSource(r, IDS)), [null, 'from income', 'received', null])
})

test('isSavingsRow / withoutSavings / savedMinor', () => {
  assert.equal(isSavingsRow(rows[1], IDS), true)
  assert.equal(isSavingsRow(rows[0], IDS), false)
  assert.equal(isSavingsRow(row({ category_id: SAV }), IDS), false) // an expense never is
  assert.equal(isSavingsRow(null, IDS), false)
  assert.deepEqual(withoutSavings(rows, IDS).map((r) => r.id), ['sal', 'food'])
  assert.equal(withoutSavings(rows, new Set()), rows) // nothing marked: the same array
  // Both kinds, each at its own captured rate: €300 + £100 × 1.2.
  assert.equal(savedMinor(rows, IDS, 'EUR'), 30000 + 12000)
  assert.equal(savedMinor(rows, new Set(), 'EUR'), 0)
  // Zero-decimal base: ¥ has no minor part.
  assert.equal(savedMinor([row({ kind: 'income', category_id: SAV, amount_minor: 1000, exchange_rate: 160 })], IDS, 'JPY'), 1600)
})

test('Home: savings aren\'t income; the net takes away only those taken from income', () => {
  const spend = spendRows(rows, 'EUR', '2026-09-01', '2026-09-30')
  const t = periodTotals(spend, 'EUR', IDS)
  assert.equal(t.earned, 200000)
  assert.equal(t.spent, 45000)
  assert.equal(t.saved, 42000) // both kinds
  assert.equal(t.savedFromIncome, 30000)
  assert.deepEqual(t.byCategory, [{ name: 'Food', value: 45000 }]) // savings aren't spending either
  const none = { expense: 0, income: 0, savedFromIncome: 0 }
  const totals = projectedTotals(t, none)
  assert.equal(totals.earnedTotal, 200000)
  assert.equal(totals.fromIncomeTotal, 30000)
  assert.equal(totals.netTotal, 200000 - 45000 - 30000)
  // Only received savings: the net is income − expenses.
  const received = periodTotals(spend.filter((r) => r.id !== 'put'), 'EUR', IDS)
  assert.equal(projectedTotals(received, none).netTotal, 200000 - 45000)
  // Without savings categories everything income counts, as before.
  assert.equal(periodTotals(spend, 'EUR').earned, 242000)
  assert.equal(periodTotals(spend, 'EUR').saved, 0)
})

test('Home: the Net tile says what it takes away', () => {
  const none = { expense: 0, income: 0, savedFromIncome: 0 }
  assert.equal(netNote(none, 0), 'income − expenses')
  assert.equal(netNote(none, 30000), 'income − expenses − savings')
  assert.equal(netNote({ ...none, savedFromIncome: 30000 }, 30000), 'incl. upcoming recurring')
  assert.equal(netNote({ ...none, expense: 100 }, 0), 'incl. upcoming recurring')
})

test('Home: a late-month salary shift still leaves savings out', () => {
  const shift = { fromDay: 25, categoryId: 'cat-salary' }
  const late = [
    row({ id: 'aug-sal', kind: 'income', category_id: 'cat-salary', amount_minor: 200000, spent_at: '2026-08-28' }),
    row({ id: 'aug-sav', kind: 'income', category_id: SAV, amount_minor: 5000, spent_at: '2026-08-28', savings_from_income: true }),
  ]
  const t = periodTotals(spendRows(late, 'EUR', '2026-09-01', '2026-09-30', { salaryShift: shift }), 'EUR', IDS)
  assert.equal(t.earned, 200000) // the salary counts in September
  assert.equal(t.saved, 0) // the saving stays in August (only salary shifts)
})

test('Home: upcoming recurring savings aren\'t income; those from income lower the projected net', () => {
  const rule = (o) => ({ frequency: 'monthly', interval_n: 1, is_active: true, next_run: '2026-09-28', ...o })
  const rules = [
    rule({ kind: 'income', category_id: 'cat-salary', amount_minor: 200000 }),
    rule({ kind: 'income', category_id: SAV, amount_minor: 30000, savings_from_income: true }),
    rule({ kind: 'income', category_id: SAV, amount_minor: 5000, savings_from_income: false }),
    rule({ kind: 'expense', category_id: 'cat-rent', amount_minor: 90000, next_run: '2026-09-29' }),
  ]
  const proj = periodProjection(rules, '2026-09-30', '2026-09-25', false, null, IDS)
  assert.deepEqual(proj, { expense: 90000, income: 200000, savedFromIncome: 30000 })
  assert.equal(projectedTotals({ spent: 0, earned: 0 }, proj).netTotal, 200000 - 90000 - 30000)
  // Without savings categories they're income, as before.
  assert.deepEqual(periodProjection(rules, '2026-09-30', '2026-09-25'), { expense: 90000, income: 235000, savedFromIncome: 0 })
  // The Recurring page's income per month leaves both kinds out.
  assert.equal(incomePerMonth(rules, IDS), 200000)
  assert.equal(incomePerMonth(rules), 235000)
})

test('Recurring: a rule made from a savings entry keeps "Taken from my income"', () => {
  const entry = { id: 't1', kind: 'income', amount_minor: 30000, currency: 'EUR', category_id: SAV, spent_at: '2026-09-02' }
  assert.equal(ruleFromTransaction({ ...entry, savings_from_income: true }).savings_from_income, true)
  assert.equal(ruleFromTransaction(entry).savings_from_income, false)
  // Switching it on an entry that repeats updates the rule's future entries.
  const rule = { ...entry, id: 'r1', frequency: 'monthly', interval_n: 1, next_run: '2026-10-02', is_active: true }
  const before = { ...entry, savings_from_income: false }
  assert.deepEqual(planRepeat({ rule, repeat: true, draft: repeatDraft(rule), before, entry: { ...before, savings_from_income: true } }),
    { action: 'update', id: 'r1', fields: { savings_from_income: true } })
})

test('Home: the "Saved" note per period, or none', () => {
  const d = new Date(2026, 8, 25)
  const eur = (m) => formatMoney(m, 'EUR')
  assert.equal(savedNote(30000, periodFromValue('m:2026-9', d), 'EUR'), `Saved ${eur(30000)} this month`)
  assert.equal(savedNote(30000, periodFromValue('m:2025-3', d), 'EUR'), `Saved ${eur(30000)} in March 2025`)
  assert.equal(savedNote(30000, periodFromValue('y:2026', d), 'EUR'), `Saved ${eur(30000)} this year`)
  assert.equal(savedNote(30000, periodFromValue('y:2025', d), 'EUR'), `Saved ${eur(30000)} in 2025`)
  assert.equal(savedNote(30000, periodFromValue('all', d), 'EUR'), `Saved ${eur(30000)} in total`)
  assert.equal(savedNote(0, periodFromValue('all', d), 'EUR'), null)
  assert.equal(savedNote(-500, periodFromValue('all', d), 'EUR'), null)
})

test('Insights: the trend leaves savings out of income; left over takes those from income', () => {
  const months = [{ key: '2026-09', label: 'Sep' }]
  assert.deepEqual(buildTrend(rows, months, 'EUR', IDS), [{ label: 'Sep', income: 2000, expense: 450, net: 2000 - 450 - 300 }])
  assert.deepEqual(buildTrend(rows, months, 'EUR'), [{ label: 'Sep', income: 2420, expense: 450, net: 2420 - 450 }])
})

test('Insights: net worth adds the savings line (both kinds) to assets and net', () => {
  const accounts = [
    { type: 'asset', balance_minor: 100000 },
    { type: 'liability', balance_minor: 40000 },
  ]
  assert.deepEqual(netWorth(accounts, 42000), { assets: 142000, liabilities: 40000, net: 102000 })
  assert.deepEqual(netWorth(accounts), { assets: 100000, liabilities: 40000, net: 60000 })
  // Savings alone (no accounts yet).
  assert.deepEqual(netWorth([], savedMinor(rows, IDS, 'EUR')), { assets: 42000, liabilities: 0, net: 42000 })
})

test('Transactions: a search\'s net is Home\'s net', () => {
  assert.equal(netBaseMinor(rows, 'EUR', IDS), 200000 - 45000 - 30000)
  assert.equal(netBaseMinor(rows, 'EUR'), 242000 - 45000)
})

test('statement: savings totalled as saved (both subtotals), never as income; the net takes those from income', () => {
  const txns = rows.slice().reverse() // my_transactions: newest first
  const s = buildStatement(txns, 'EUR', { from: '2026-09-01', to: '2026-09-30', savingsIds: IDS })
  assert.equal(s.totalIncome, 2000)
  assert.equal(s.totalSpent, 450)
  assert.equal(s.net, 2000 - 450 - 300)
  assert.deepEqual(s.saved, { total: 420, fromIncome: 300, received: 120 })
  assert.deepEqual(s.byCategory, { Food: 450 })
  assert.deepEqual(s.rows.map((r) => r.saved), [null, 'from income', 'received', null])
  assert.equal(savingsNote(s.saved), 'Savings aren’t income; those taken from your income are subtracted from the net.')
  const [summary, list] = statementSheets(s, 'EUR', [])
  const cells = Object.fromEntries(summary.rows.filter((r) => r.length === 2))
  assert.equal(cells['Total income'], 2000)
  assert.equal(cells.Net, 2000 - 450 - 300)
  assert.equal(cells['Saved (not income)'], 420)
  assert.equal(cells['Saved from income'], 300)
  assert.equal(cells['Saved, received'], 120)
  assert.deepEqual(list.rows.slice(1).map((r) => r[1]), ['income', 'saved (from income)', 'saved (received)', 'expense'])
  assert.deepEqual(list.rows.slice(1).filter((r) => r[1].startsWith('saved')).map((r) => r[6]), [300, 120])

  // One kind only: the total, no subtotals; received savings leave the net alone.
  const received = buildStatement(txns.filter((t) => t.id !== 'put'), 'EUR', { from: '2026-09-01', to: '2026-09-30', savingsIds: IDS })
  assert.equal(received.net, 2000 - 450)
  assert.deepEqual(received.saved, { total: 120, fromIncome: 0, received: 120 })
  assert.equal(savingsNote(received.saved), 'Savings aren’t income and don’t change the net (see Saved).')
  const onlyRows = statementSheets(received, 'EUR', [])[0].rows.map((r) => r[0])
  assert.ok(onlyRows.includes('Saved (not income)'))
  assert.ok(!onlyRows.includes('Saved from income') && !onlyRows.includes('Saved, received'))

  // No savings categories: no "Saved" lines, everything income counts.
  const plain = buildStatement(txns, 'EUR', { from: '2026-09-01', to: '2026-09-30' })
  assert.equal(plain.totalIncome, 2420)
  assert.equal(plain.net, 2420 - 450)
  assert.equal(plain.saved, null)
  assert.equal(savingsNote(plain.saved), null)
  assert.ok(!statementSheets(plain, 'EUR', [])[0].rows.some((r) => String(r[0]).startsWith('Saved')))
})
