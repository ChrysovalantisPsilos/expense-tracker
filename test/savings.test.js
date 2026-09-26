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
  EFFECTS, savingsIdsOf, isSavingsRow, rowEffect, savingsNoteLabel, isSpending, netSign, savingsPotMinor,
  isSavingsAccount, savingsTotal,
} from '../src/shared/lib/savings.js'
import { potSign, savingsSource } from '../supabase/functions/_shared/savings.ts'
import { formatMoney } from '../src/shared/lib/currency.js'
import { spendRows } from '../src/shared/lib/spread.js'
import {
  periodTotals, periodProjection, projectedTotals, netNote, savedNote,
} from '../src/features/dashboard/dashboardMath.js'
import { accountSections, buildTrend, netWorth } from '../src/features/insights/insightsMath.js'
import { netBaseMinor } from '../src/features/transactions/txnFilter.js'
import { incomePerMonth, planRepeat, repeatDraft, ruleFromTransaction } from '../src/features/recurring/recurringMath.js'
import { periodFromValue } from '../src/features/transactions/periods.js'
import { loadLanguage } from '../src/shared/lib/i18n/i18n.js'
import {
  buildStatement, fromSavingsNote, savingsNote, statementSheets,
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

test('isSavingsRow / savingsPotMinor', () => {
  assert.equal(isSavingsRow(rows[1], IDS), true)
  assert.equal(isSavingsRow(rows[0], IDS), false)
  assert.equal(isSavingsRow(row({ category_id: SAV }), IDS), false) // an expense never is
  assert.equal(isSavingsRow(null, IDS), false)
  // Both kinds, each at its own captured rate: €300 + £100 × 1.2.
  assert.equal(savingsPotMinor(rows, IDS, 'EUR'), 30000 + 12000)
  assert.equal(savingsPotMinor(rows, new Set(), 'EUR'), 0)
  // Zero-decimal base: ¥ has no minor part.
  assert.equal(savingsPotMinor([row({ kind: 'income', category_id: SAV, amount_minor: 1000, exchange_rate: 160 })], IDS, 'JPY'), 1600)
})

test('Home: savings aren\'t income; the net takes away only those taken from income', () => {
  const spend = spendRows(rows, 'EUR', '2026-09-01', '2026-09-30')
  const t = periodTotals(spend, 'EUR', IDS)
  assert.equal(t.earned, 200000)
  assert.equal(t.spent, 45000)
  assert.equal(t.saved, 42000) // both kinds
  assert.equal(t.savedFromIncome, 30000)
  assert.deepEqual(t.byCategory, [{ name: 'Food', value: 45000 }]) // savings aren't spending either
  const none = periodProjection([], '2026-08-31', '2026-09-25') // a past period: nothing ahead
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
  const none = periodProjection([], null, '2026-09-25')
  assert.equal(netNote(none, 0, 0), 'income − expenses')
  assert.equal(netNote(none, 30000, 0), 'income − expenses − savings')
  assert.equal(netNote(none, 0, 90000), 'excl. spending from savings')
  assert.equal(netNote(none, 30000, 90000), 'excl. spending from savings')
  assert.equal(netNote({ ...none, savedFromIncome: 30000 }, 30000, 0), 'incl. upcoming recurring')
  assert.equal(netNote({ ...none, expense: 100 }, 0, 0), 'incl. upcoming recurring')
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
  assert.deepEqual(proj,
    { expense: 90000, income: 200000, expenseFromSavings: 0, savedFromIncome: 30000, net: 200000 - 90000 - 30000 })
  assert.equal(projectedTotals(periodTotals([], 'EUR', IDS), proj).netTotal, 200000 - 90000 - 30000)
  // Without savings categories they're income, as before.
  assert.deepEqual(periodProjection(rules, '2026-09-30', '2026-09-25'),
    { expense: 90000, income: 235000, expenseFromSavings: 0, savedFromIncome: 0, net: 235000 - 90000 })
  // The Recurring page's income per month leaves both kinds out.
  assert.equal(incomePerMonth(rules, IDS).perMonth, 200000)
  assert.equal(incomePerMonth(rules).perMonth, 235000)
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

test('Home: the "Saved" note in Greek, from the period (not its English label)', async () => {
  const d = new Date(2026, 8, 25)
  await loadLanguage('el')
  try {
    const eur = formatMoney(30000, 'EUR')
    assert.equal(savedNote(30000, periodFromValue('m:2026-9', d), 'EUR'), `Αποταμίευσες ${eur} αυτόν τον μήνα`)
    assert.equal(savedNote(30000, periodFromValue('y:2026', d), 'EUR'), `Αποταμίευσες ${eur} φέτος`)
    assert.equal(savedNote(30000, periodFromValue('m:2025-3', d), 'EUR'), `Μάρτιος 2025: αποταμίευσες ${eur}`)
    assert.equal(savedNote(30000, periodFromValue('all', d), 'EUR'), `Αποταμίευσες ${eur} συνολικά`)
  } finally {
    await loadLanguage('en')
  }
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
  assert.deepEqual(netWorth(accounts, 42000), { assets: 142000, liabilities: 40000, net: 102000, showPot: true })
  assert.deepEqual(netWorth(accounts), { assets: 100000, liabilities: 40000, net: 60000, showPot: false })
  // Savings alone (no accounts yet).
  assert.deepEqual(netWorth([], savingsPotMinor(rows, IDS, 'EUR')), { assets: 42000, liabilities: 0, net: 42000, showPot: true })
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
  assert.equal(s.spentFromSavings, 0)
  assert.equal(fromSavingsNote(s.spentFromSavings), null)
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

// ---- Expenses paid from savings (0085): spending, not Net --------------------
// September as above, plus a €900 laptop paid from savings.
const laptop = row({ id: 'laptop', category_id: 'cat-tech', amount_minor: 90000, paid_from_savings: true,
  categories: { name: 'Tech' } })
const withLaptop = [...rows, laptop]

test('rowEffect: an expense paid from savings; how every effect moves spending, the net and the pot', () => {
  assert.equal(rowEffect(laptop, IDS), 'expense-from-savings')
  // The flag is on the row: it holds without savings categories too.
  assert.equal(rowEffect(laptop, new Set()), 'expense-from-savings')
  assert.equal(rowEffect(row({ paid_from_savings: false }), IDS), 'expense')
  // It means nothing on income (the CHECK keeps it off; never trusted).
  assert.equal(rowEffect(row({ kind: 'income', category_id: 'cat-salary', paid_from_savings: true }), IDS), 'income')
  assert.equal(rowEffect(row({ kind: 'income', category_id: SAV, paid_from_savings: true }), IDS), 'saved-received')
  assert.deepEqual(EFFECTS, ['income', 'expense', 'expense-from-savings', 'saved-from-income', 'saved-received'])
  assert.deepEqual(EFFECTS.map(isSpending), [false, true, true, false, false])
  assert.deepEqual(EFFECTS.map(netSign), [1, -1, 0, -1, 0])
  assert.deepEqual(EFFECTS.map(potSign), [0, 0, -1, 1, 1])
  // The lists' note: "from savings" on it, the savings entries' source otherwise.
  assert.deepEqual(withLaptop.map((r) => savingsNoteLabel(r, IDS)), [null, 'from income', 'received', null, 'from savings'])
  assert.equal(savingsSource(laptop, IDS), null) // not a savings entry
})

test('Home: an expense paid from savings is spent, but the net leaves it out', () => {
  const spend = spendRows(withLaptop, 'EUR', '2026-09-01', '2026-09-30')
  const t = periodTotals(spend, 'EUR', IDS)
  assert.equal(t.spent, 45000 + 90000) // Spent includes it
  assert.equal(t.spentFromSavings, 90000)
  assert.deepEqual(t.byCategory, [{ name: 'Tech', value: 90000 }, { name: 'Food', value: 45000 }])
  assert.equal(t.earned, 200000)
  assert.equal(t.saved, 42000) // the Saved note is what went in, unchanged
  assert.equal(t.net, 200000 - 45000 - 30000) // as without the laptop
  const totals = projectedTotals(t, periodProjection([], '2026-08-31', '2026-09-25'))
  assert.equal(totals.spentTotal, 135000)
  assert.equal(totals.fromSavingsTotal, 90000)
  assert.equal(totals.netTotal, 200000 - 45000 - 30000)
  // A foreign one counts at its captured rate: $100 at 0.9 → €90 spent, net unchanged.
  const usd = periodTotals([...spend, row({ amount_minor: 10000, currency: 'USD', exchange_rate: 0.9, paid_from_savings: true })], 'EUR', IDS)
  assert.equal(usd.spent - t.spent, 9000)
  assert.equal(usd.net, t.net)
})

test('Home: an upcoming expense paid from savings is projected spending, not against the projected net', () => {
  const rule = (o) => ({ frequency: 'monthly', interval_n: 1, is_active: true, next_run: '2026-09-28', ...o })
  const rules = [
    rule({ kind: 'income', category_id: 'cat-salary', amount_minor: 200000 }),
    rule({ kind: 'expense', category_id: 'cat-rent', amount_minor: 90000, next_run: '2026-09-29' }),
    rule({ kind: 'expense', category_id: 'cat-gym', amount_minor: 5000, paid_from_savings: true }),
  ]
  const proj = periodProjection(rules, '2026-09-30', '2026-09-25', false, null, IDS)
  assert.deepEqual(proj,
    { expense: 95000, income: 200000, expenseFromSavings: 5000, savedFromIncome: 0, net: 200000 - 90000 })
  const t = periodTotals(spendRows(withLaptop, 'EUR', '2026-09-01', '2026-09-30'), 'EUR', IDS)
  const totals = projectedTotals(t, proj)
  assert.equal(totals.spentTotal, 135000 + 95000)
  assert.equal(totals.fromSavingsTotal, 95000)
  assert.equal(totals.netTotal, (200000 - 45000 - 30000) + (200000 - 90000))
})

test('Insights: spending counts it, "Left over" doesn\'t; the Savings line takes it away', () => {
  const months = [{ key: '2026-09', label: 'Sep' }]
  assert.deepEqual(buildTrend(withLaptop, months, 'EUR', IDS),
    [{ label: 'Sep', income: 2000, expense: 1350, net: 2000 - 450 - 300 }])
  // The pot: €420 in, €900 out → −€480. Shown with a minus, as a debt.
  const pot = savingsPotMinor(withLaptop, IDS, 'EUR')
  assert.equal(pot, 42000 - 90000)
  const accounts = [{ type: 'asset', balance_minor: 100000 }, { type: 'liability', balance_minor: 40000 }]
  assert.deepEqual(netWorth(accounts, pot), { assets: 100000, liabilities: 40000 + 48000, net: 100000 - 40000 - 48000, showPot: true })
  assert.deepEqual(netWorth([], pot), { assets: 0, liabilities: 48000, net: -48000, showPot: true })
  // Less paid out than saved: still an asset, reduced.
  const small = [...rows, { ...laptop, amount_minor: 10000 }]
  assert.equal(savingsPotMinor(small, IDS, 'EUR'), 32000)
  assert.deepEqual(netWorth([], savingsPotMinor(small, IDS, 'EUR')), { assets: 32000, liabilities: 0, net: 32000, showPot: true })
  // Exactly used up: zero (the line is hidden).
  assert.equal(savingsPotMinor([...rows, { ...laptop, amount_minor: 42000 }], IDS, 'EUR'), 0)
  // Each at its captured rate: £100 × 1.2 in, $50 × 0.9 out.
  const fx = [rows[2], { ...laptop, amount_minor: 5000, currency: 'USD', exchange_rate: 0.9 }]
  assert.equal(savingsPotMinor(fx, IDS, 'EUR'), 12000 - 4500)
})

test('Transactions: a search\'s net leaves an expense paid from savings out', () => {
  assert.equal(netBaseMinor(withLaptop, 'EUR', IDS), 200000 - 45000 - 30000)
  assert.equal(netBaseMinor([laptop], 'EUR', IDS), 0)
})

test('Recurring: a rule made from an expense paid from savings keeps it; switching it updates the rule', () => {
  const entry = { id: 't1', kind: 'expense', amount_minor: 5000, currency: 'EUR', category_id: null, spent_at: '2026-09-02' }
  assert.equal(ruleFromTransaction({ ...entry, paid_from_savings: true }).paid_from_savings, true)
  assert.equal(ruleFromTransaction(entry).paid_from_savings, false)
  const rule = { ...entry, id: 'r1', frequency: 'monthly', interval_n: 1, next_run: '2026-10-02', is_active: true }
  const before = { ...entry, savings_from_income: false, paid_from_savings: false }
  assert.deepEqual(planRepeat({ rule, repeat: true, draft: repeatDraft(rule), before, entry: { ...before, paid_from_savings: true } }),
    { action: 'update', id: 'r1', fields: { paid_from_savings: true } })
})

test('statement: an expense paid from savings is spending, left out of the net, with one note', () => {
  const txns = withLaptop.slice().reverse() // my_transactions: newest first
  const s = buildStatement(txns, 'EUR', { from: '2026-09-01', to: '2026-09-30', savingsIds: IDS })
  assert.equal(s.totalSpent, 450 + 900)
  assert.equal(s.spentFromSavings, 900)
  assert.equal(s.totalIncome, 2000)
  assert.equal(s.net, 2000 - 450 - 300)
  assert.deepEqual(s.byCategory, { Food: 450, Tech: 900 })
  assert.deepEqual(s.saved, { total: 420, fromIncome: 300, received: 120 }) // what went in, unchanged
  assert.deepEqual(s.rows.map((r) => r.fromSavings), [false, false, false, false, true])
  assert.equal(fromSavingsNote(s.spentFromSavings), 'Expenses paid from savings count as spending but not against your income.')
  const [summary, list] = statementSheets(s, 'EUR', [fromSavingsNote(s.spentFromSavings)])
  const cells = Object.fromEntries(summary.rows.filter((r) => r.length === 2))
  assert.equal(cells['Total expenses'], 1350)
  assert.equal(cells['Of which paid from savings'], 900)
  assert.equal(cells.Net, 2000 - 450 - 300)
  assert.ok(summary.rows.some((r) => r.length === 1 && r[0].startsWith('Expenses paid from savings')))
  assert.deepEqual(list.rows.slice(1).map((r) => r[1]),
    ['income', 'saved (from income)', 'saved (received)', 'expense', 'expense (from savings)'])
  // A description that looks like a formula stays text, flag or not.
  const risky = buildStatement([{ ...laptop, description: '=HYPERLINK("x")' }], 'EUR', { from: '2026-09-01', to: '2026-09-30' })
  assert.equal(statementSheets(risky, 'EUR', [])[1].rows[1][3], '\'=HYPERLINK("x")')
  // None in the period: no line, no note.
  const none = buildStatement(rows.slice().reverse(), 'EUR', { from: '2026-09-01', to: '2026-09-30', savingsIds: IDS })
  assert.equal(none.spentFromSavings, 0)
  assert.ok(!statementSheets(none, 'EUR', [])[0].rows.some((r) => r[0] === 'Of which paid from savings'))
})

// ── Savings accounts (0092) ─────────────────────────────────────────────────
// The owner's case: a manual "Savings" account of €10,213 holding the money
// the savings entries recorded going in (a €420 pot here).
const current = { id: 'a1', type: 'asset', name: 'Current', balance_minor: 250000, currency: 'EUR' }
const card = { id: 'a2', type: 'liability', name: 'Card', balance_minor: 40000, currency: 'EUR' }
const kept = { id: 'a3', type: 'savings', name: 'Savings', balance_minor: 1021300, currency: 'EUR' }
const deposit = { id: 'a4', type: 'savings', name: 'Deposit', balance_minor: 500000, currency: 'EUR' }

test('isSavingsAccount: only type savings', () => {
  assert.equal(isSavingsAccount(kept), true)
  for (const a of [current, card, {}, null, undefined]) assert.equal(isSavingsAccount(a), false)
})

test('savingsTotal: savings accounts ARE the total; without one, the pot from the entries', () => {
  const pot = savingsPotMinor(rows, IDS, 'EUR')
  assert.equal(pot, 42000)
  // No savings account: exactly as before.
  assert.deepEqual(savingsTotal([current, card], pot), { minor: 42000, source: 'entries', accounts: [] })
  assert.deepEqual(savingsTotal([], -500), { minor: -500, source: 'entries', accounts: [] })
  assert.deepEqual(savingsTotal(null, 0), { minor: 0, source: 'entries', accounts: [] })
  // One: its balance, the pot not added on top.
  assert.deepEqual(savingsTotal([current, kept, card], pot), { minor: 1021300, source: 'accounts', accounts: [kept] })
  // Several: their sum, whatever the pot (even with no entries at all).
  assert.deepEqual(savingsTotal([kept, current, deposit], 0).minor, 1521300)
  assert.equal(savingsTotal([kept, deposit], -99999).minor, 1521300)
  // Balances as the RPC may return them (bigint as text) still add up.
  assert.equal(savingsTotal([{ type: 'savings', balance_minor: '100' }, { type: 'savings', balance_minor: 5 }], 0).minor, 105)
})

test('net worth: savings accounts count once, and the computed Savings line goes', () => {
  const pot = savingsPotMinor(rows, IDS, 'EUR')
  // Without a savings account the pot line stays (as today).
  assert.deepEqual(netWorth([current, card], pot),
    { assets: 250000 + 42000, liabilities: 40000, net: 250000 + 42000 - 40000, showPot: true })
  // With one: its balance is an asset, the pot isn't added — nothing twice.
  assert.deepEqual(netWorth([current, card, kept], pot),
    { assets: 250000 + 1021300, liabilities: 40000, net: 250000 + 1021300 - 40000, showPot: false })
  // A negative pot (more paid from savings than recorded) isn't a debt then either.
  assert.deepEqual(netWorth([kept], -48000), { assets: 1021300, liabilities: 0, net: 1021300, showPot: false })
  // Net worth's savings figure is the Savings page's total.
  const withAccounts = netWorth([kept, deposit], pot)
  assert.equal(withAccounts.assets, savingsTotal([kept, deposit], pot).minor)
})

test('net worth lists: savings accounts under Savings, the rest under Accounts, in order', () => {
  assert.deepEqual(accountSections([current, kept, card, deposit]),
    { savings: [kept, deposit], other: [current, card] })
  assert.deepEqual(accountSections([current]), { savings: [], other: [current] })
})
