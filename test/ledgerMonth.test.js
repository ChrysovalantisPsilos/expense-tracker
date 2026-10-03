// Activity / the Transactions page for a month, with the salary setting on:
// pay months (payCalendar). The month's window starts on its payday, so the
// read (ledgerRead), the list (ledgerShown) and the header's Income and Net
// cover the same rows as Home's totals for the month (periodTotals over
// spendRows), every row on its real date.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ledgerRead, ledgerShown, EMPTY_FILTERS } from '../src/features/transactions/txnFilter.js'
import { dayGroups, monthPulse } from '../src/features/transactions/rowParts.js'
import { periodTotals } from '../src/features/dashboard/dashboardMath.js'
import { spendRows } from '../src/shared/lib/spread.js'
import { payCalendar, salaryShiftOf } from '../src/shared/lib/payCalendar.js'
import { periodFromValue, periodWithRange, thisMonthPeriod } from '../src/shared/lib/periods.js'
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
  row('oct-pay', '2026-10-29', 'income', 241400, PAY), // opens November
  row('shop', '2026-10-02', 'expense', 9900, SHOP),
  row('gift', '2026-10-01', 'income', 10000, FRIENDS),
  row('lunch', '2026-10-01', 'expense', 1500, SHOP),
  row('pot', '2026-10-01', 'income', 20000, POT, { savings_from_income: true }),
  row('after', '2026-09-30', 'expense', 3000, SHOP), // after payday: October's
  row('sep-pay', '2026-09-29', 'income', 241400, PAY), // opens October
  row('sep-gift', '2026-09-26', 'income', 5000, FRIENDS), // September's own
  row('sep-shop', '2026-09-20', 'expense', 4000, SHOP),
  row('aug-pay', '2026-08-28', 'income', 241400, PAY), // opens September
]
const serve = ({ kind, from, to }) => ALL.filter((r) => (!kind || r.kind === kind)
  && (!from || r.spent_at >= from) && (!to || r.spent_at <= to))

const shift = salaryShiftOf({ salary_shift_from_day: 25, salary_category_id: SALARY })
const savingsIds = new Set([SAVINGS])
const TODAY = '2026-10-02'
const NOW = new Date(2026, 9, 2)
const CAL = payCalendar(shift, ['2026-08-28', '2026-09-29', '2026-10-29'], TODAY)
const OCTOBER = thisMonthPeriod(NOW, CAL)
const SEPTEMBER = periodFromValue('m:2026-9', NOW, CAL)

// The month as the page shows it: the read, the rows listed, the header.
function month(m, kind = undefined) {
  const rows = serve(ledgerRead({ kind, filters: EMPTY_FILTERS, searching: false, month: m }))
  const shown = ledgerShown(rows, { searching: false, month: m }, 'EUR')
  return {
    shown,
    pulse: monthPulse(shown, { kind, baseCurrency: 'EUR', savingsIds }, m, TODAY),
    days: dayGroups(shown, { kind, baseCurrency: 'EUR', savingsIds }, TODAY),
  }
}

// Home's totals for the month: the same window through spendRows.
function home(m) {
  return periodTotals(spendRows(serve(m), 'EUR', m.from, m.to, { cal: CAL }), 'EUR', savingsIds)
}

test('the pay months: October from the 29 Sep payday to the day before November\'s', () => {
  assert.deepEqual([OCTOBER.value, OCTOBER.from, OCTOBER.to], ['m:2026-10', '2026-09-29', '2026-10-28'])
  assert.deepEqual([SEPTEMBER.from, SEPTEMBER.to], ['2026-08-28', '2026-09-28'])
  assert.equal(periodWithRange(OCTOBER), 'This month · 29 Sep – 28 Oct')
})

test('ledgerRead: one window for every kind', () => {
  for (const kind of [undefined, 'income', 'expense']) {
    assert.deepEqual(ledgerRead({ kind, searching: false, month: OCTOBER }), { kind, from: '2026-09-29', to: '2026-10-28' })
  }
})

test('October: its payday and what came after it are listed and counted; November\'s salary is not', () => {
  const october = month(OCTOBER)
  assert.deepEqual(october.shown.map((r) => r.id), ['shop', 'gift', 'lunch', 'pot', 'after', 'sep-pay'])
  const totals = home(OCTOBER)
  assert.equal(october.pulse.income.amount, formatSigned(totals.earned, 'EUR', { plus: true }))
  assert.equal(october.pulse.income.amount, '+€2,514.00')
  assert.equal(october.pulse.spent.amount, formatMoney(totals.spent, 'EUR'))
  assert.equal(october.pulse.net.text, signedAmount(totals.net, (m) => formatMoney(m, 'EUR')).text)
  assert.equal(october.pulse.net.text, '+€2,170.00')
  // Listed on its real day; no "counts for" note any more.
  const last = october.days.at(-1)
  assert.equal(last.title, '29 Sep')
  assert.deepEqual(last.rows.map((r) => r.id), ['sep-pay'])
  assert.equal('countsFor' in last.rows[0], false)
  // The header's days run over the whole window, the days before October
  // named with their month.
  assert.equal(october.pulse.days.length, 30)
  assert.deepEqual(october.pulse.days.slice(0, 3).map((d) => d.label), ['29 Sep', '30 Sep', '1'])
  // The Income view counts and lists it the same way.
  const income = month(OCTOBER, 'income')
  assert.deepEqual(income.shown.map((r) => r.id), ['gift', 'pot', 'sep-pay'])
  assert.equal(income.pulse.income.amount, '+€2,514.00')
})

test('September: from its own payday to the day before October\'s; never a row in two months', () => {
  const september = month(SEPTEMBER)
  assert.deepEqual(september.shown.map((r) => r.id), ['sep-gift', 'sep-shop', 'aug-pay'])
  const totals = home(SEPTEMBER)
  assert.equal(september.pulse.income.amount, formatSigned(totals.earned, 'EUR', { plus: true }))
  assert.equal(september.pulse.net.text, signedAmount(totals.net, (m) => formatMoney(m, 'EUR')).text)
  for (const id of ALL.map((r) => r.id)) {
    const n = [...september.shown, ...month(OCTOBER).shown].filter((r) => r.id === id).length
    assert.ok(n <= 1, id)
  }
})

test('the setting off: calendar months, exactly as before', () => {
  const calendar = thisMonthPeriod(NOW)
  assert.deepEqual([calendar.from, calendar.to, calendar.range], ['2026-10-01', '2026-10-31', undefined])
  assert.deepEqual(month(calendar).shown.map((r) => r.id), ['oct-pay', 'shop', 'gift', 'lunch', 'pot'])
  assert.equal(month(calendar).pulse.days.length, 31)
})

test('ledgerShown: a search keeps every matching row by its real date', () => {
  const found = ledgerShown(ALL, { text: 'salary', searching: true, month: OCTOBER }, 'EUR')
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
  const day = (key) => pulse.days.find((d) => d.key === key)
  assert.equal(day('2026-09-30').spoken, '30 Sep · €30.00')
  assert.equal(day('2026-10-01').spoken, '1 Oct · €15.00')
  assert.equal(day('2026-10-02').spoken, '2 Oct · €99.00')
  assert.equal(day('2026-10-03').spoken, null) // ahead
  const sep = month(SEPTEMBER).pulse.days
  assert.equal(sep[0].label, '28 Aug')
  assert.equal(sep.find((d) => d.key === '2026-09-20').spoken, '20 Sep · €40.00')
})
