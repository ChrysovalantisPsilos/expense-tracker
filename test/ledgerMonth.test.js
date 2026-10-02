// Activity / the Transactions page for a month, with the salary setting on
// (0081): last month's late salary counts in this month, so the month's
// read reaches back for it (ledgerRead), the list shows it in the month it
// counts for (ledgerShown), and the header's Income and Net equal Home's
// totals for the month (periodTotals over spendRows).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ledgerRead, ledgerShown, EMPTY_FILTERS } from '../src/features/transactions/txnFilter.js'
import { dayGroups, monthPulse } from '../src/features/transactions/rowParts.js'
import { periodTotals } from '../src/features/dashboard/dashboardMath.js'
import { spendRows } from '../src/shared/lib/spread.js'
import { salaryShiftOf } from '../src/shared/lib/salaryShift.js'
import { formatMoney, formatSigned } from '../src/shared/lib/currency.js'
import { signedAmount } from '../src/shared/ui/kit/kitMath.js'

const SALARY = 'cat-salary'
const SAVINGS = 'cat-savings'
const cat = (id, name, kind = 'expense') => ({ id, name, kind, icon: null, color: null })
const PAY = cat(SALARY, 'Salary', 'income')
const FRIENDS = cat('cat-friends', 'Friends & family', 'income')
const SHOP = cat('cat-shop', 'Shopping')
const POT = cat(SAVINGS, 'Savings', 'income')
const row = (id, spent_at, kind, amount_minor, categories, extra = {}) => ({
  id, spent_at, kind, amount_minor, currency: 'EUR', exchange_rate: 1, category_id: categories.id, categories,
  description: null, notes: null, group_expense_id: null, recurring: null, spread_months: null,
  savings_from_income: null, paid_from_savings: false, paid_with_vouchers: false, ...extra,
})

// Every entry of the account; `serve` answers a read as my_transactions does.
const ALL = [
  row('oct-pay', '2026-10-29', 'income', 241400, PAY), // counts for November
  row('shop', '2026-10-02', 'expense', 9900, SHOP),
  row('gift', '2026-10-01', 'income', 10000, FRIENDS),
  row('lunch', '2026-10-01', 'expense', 1500, SHOP),
  row('pot', '2026-10-01', 'income', 20000, POT, { savings_from_income: true }),
  row('sep-pay', '2026-09-29', 'income', 241400, PAY), // paid in September, counts for October
  row('sep-gift', '2026-09-26', 'income', 5000, FRIENDS), // September's own
  row('sep-shop', '2026-09-20', 'expense', 4000, SHOP),
  row('aug-pay', '2026-08-28', 'income', 241400, PAY), // counts for September
]
const serve = ({ kind, from, to }) => ALL.filter((r) => (!kind || r.kind === kind)
  && (!from || r.spent_at >= from) && (!to || r.spent_at <= to))

const shift = salaryShiftOf({ salary_shift_from_day: 25, salary_category_id: SALARY })
const savingsIds = new Set([SAVINGS])
const OCTOBER = { from: '2026-10-01', to: '2026-10-31' }
const SEPTEMBER = { from: '2026-09-01', to: '2026-09-30' }
const TODAY = '2026-10-02'

// The month as the page shows it: the read, the rows listed, the header.
function month(m, kind = undefined, salaryShift = shift) {
  const rows = serve(ledgerRead({ kind, filters: EMPTY_FILTERS, searching: false, month: m, salaryShift }))
  const shown = ledgerShown(rows, { searching: false, month: m, salaryShift }, 'EUR')
  return {
    shown,
    pulse: monthPulse(shown, { kind, baseCurrency: 'EUR', savingsIds }, m, TODAY),
    days: dayGroups(shown, { kind, baseCurrency: 'EUR', salaryShift, savingsIds }, TODAY),
  }
}

// Home's totals for the month: its read (shiftFetchFrom) through spendRows.
function home(m) {
  const rows = serve({ from: '2026-08-25', to: m.to })
  return periodTotals(spendRows(rows, 'EUR', m.from, m.to, { salaryShift: shift }), 'EUR', savingsIds)
}

test('before: a read of the month alone misses the salary that counts in it', () => {
  // What both the website and the app read until now, on 2 October: the
  // month's own dates, every row listed.
  const before = serve({ from: OCTOBER.from, to: TODAY })
  assert.ok(!before.some((r) => r.id === 'sep-pay'))
  const pulse = monthPulse(before, { baseCurrency: 'EUR', savingsIds }, OCTOBER, TODAY)
  assert.equal(pulse.income.amount, '+€100.00')
  assert.equal(pulse.net.text, '−€214.00')
  assert.notEqual(pulse.income.amount, formatSigned(home(OCTOBER).earned, 'EUR', { plus: true }))
})

test('ledgerRead: a month that can hold income reaches back to last month\'s late salary', () => {
  assert.deepEqual(ledgerRead({ kind: undefined, searching: false, month: OCTOBER, salaryShift: shift }),
    { kind: undefined, from: '2026-09-25', to: '2026-10-31' })
  assert.deepEqual(ledgerRead({ kind: 'income', searching: false, month: OCTOBER, salaryShift: shift }),
    { kind: 'income', from: '2026-09-25', to: '2026-10-31' })
  // Expenses never move; nor does anything with the setting off.
  assert.deepEqual(ledgerRead({ kind: 'expense', searching: false, month: OCTOBER, salaryShift: shift }),
    { kind: 'expense', from: '2026-10-01', to: '2026-10-31' })
  assert.deepEqual(ledgerRead({ kind: undefined, searching: false, month: OCTOBER }),
    { kind: undefined, from: '2026-10-01', to: '2026-10-31' })
})

test('October: September\'s late salary is listed and counted; October\'s own moves on to November', () => {
  const october = month(OCTOBER)
  assert.deepEqual(october.shown.map((r) => r.id), ['shop', 'gift', 'lunch', 'pot', 'sep-pay'])
  const totals = home(OCTOBER)
  assert.equal(october.pulse.income.amount, formatSigned(totals.earned, 'EUR', { plus: true }))
  assert.equal(october.pulse.income.amount, '+€2,514.00')
  assert.equal(october.pulse.spent.amount, formatMoney(totals.spent, 'EUR'))
  assert.equal(october.pulse.net.text, signedAmount(totals.net, (m) => formatMoney(m, 'EUR')).text)
  assert.equal(october.pulse.net.text, '+€2,200.00')
  // Listed on its real day, with the month it counts for.
  const last = october.days.at(-1)
  assert.equal(last.title, '29 Sep')
  assert.deepEqual(last.rows.map((r) => [r.id, r.countsFor]), [['sep-pay', 'Counts for October']])
  // Its bar is on its real day (last month): none in October's row.
  assert.equal(october.pulse.days.length, 31)
  // The Income view counts and lists it the same way.
  const income = month(OCTOBER, 'income')
  assert.deepEqual(income.shown.map((r) => r.id), ['gift', 'pot', 'sep-pay'])
  assert.equal(income.pulse.income.amount, '+€2,514.00')
})

test('September: the salary paid on the 29th is not listed (it counts for October); August\'s is', () => {
  const september = month(SEPTEMBER)
  assert.deepEqual(september.shown.map((r) => r.id), ['sep-gift', 'sep-shop', 'aug-pay'])
  const totals = home(SEPTEMBER)
  assert.equal(september.pulse.income.amount, formatSigned(totals.earned, 'EUR', { plus: true }))
  assert.equal(september.pulse.net.text, signedAmount(totals.net, (m) => formatMoney(m, 'EUR')).text)
  // Never in two months.
  const both = [...september.shown, ...month(OCTOBER).shown].filter((r) => r.id === 'sep-pay')
  assert.equal(both.length, 1)
})

test('ledgerShown: a search keeps every matching row by its real date', () => {
  const found = ledgerShown(ALL, { text: 'salary', searching: true, month: OCTOBER, salaryShift: shift }, 'EUR')
  assert.deepEqual(found.map((r) => r.id), ['oct-pay', 'sep-pay', 'aug-pay'])
  assert.equal(ledgerShown(ALL, { searching: false, month: null }, 'EUR'), ALL)
})

test('dayGroups: a day with income says its net; a day that only spent, what it spent', () => {
  const october = month(OCTOBER)
  const byKey = Object.fromEntries(october.days.map((d) => [d.key, d]))
  // 2 Oct: spending only.
  assert.equal(byKey['2026-10-02'].spent, '€99.00 spent')
  assert.equal(byKey['2026-10-02'].net, null)
  // 1 Oct: +€100 from friends, €15 spent, €200 put aside from income → −€115.
  assert.equal(byKey['2026-10-01'].spent, null)
  assert.deepEqual(byKey['2026-10-01'].net, { text: '−€115.00 net', tone: 'negative' })
  assert.deepEqual(byKey['2026-09-29'].net, { text: '+€2,414.00 net', tone: 'positive' })
  // The owner's day: +€100.00 in, €99.00 out.
  const [day] = dayGroups([row('in', '2026-10-01', 'income', 10000, FRIENDS), row('out', '2026-10-01', 'expense', 9900, SHOP)],
    { baseCurrency: 'EUR', savingsIds }, TODAY)
  assert.deepEqual([day.spent, day.net], [null, { text: '+€1.00 net', tone: 'positive' }])
  // Savings aren't income: a day with only a saving still says what it spent.
  const [saved] = dayGroups([row('p', '2026-10-01', 'income', 20000, POT, { savings_from_income: true }),
    row('o', '2026-10-01', 'expense', 900, SHOP)], { baseCurrency: 'EUR', savingsIds }, TODAY)
  assert.deepEqual([saved.spent, saved.net], ['€9.00 spent', null])
})

test('monthPulse: a day with a bar that isn\'t ahead opens its day (its spoken name); the others don\'t', () => {
  const { pulse } = month(OCTOBER)
  const day = (n) => pulse.days[n - 1]
  assert.equal(day(1).spoken, '1 Oct · €15.00')
  assert.equal(day(2).spoken, '2 Oct · €99.00')
  assert.equal(day(3).spoken, null) // ahead
  const empty = month(SEPTEMBER).pulse.days
  assert.equal(empty[0].spoken, null) // nothing spent
  assert.equal(empty[19].spoken, '20 Sep · €40.00')
})
