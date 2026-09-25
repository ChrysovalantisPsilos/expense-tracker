// generate-report's statement maths (supabase/functions/generate-report).
// Node strips the TypeScript types.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildStatement, pendingNote, statementSheets, yearlyLabel, yearlyNote,
} from '../supabase/functions/generate-report/statementMath.ts'
import { subscriptionGroups } from '../src/features/recurring/recurringMath.js'

// my_transactions order: newest first.
const txns = [
  { spent_at: '2026-09-05', kind: 'expense', amount_minor: 1500, currency: 'JPY', exchange_rate: null,
    categories: { name: 'Food' } },
  { spent_at: '2026-09-04', kind: 'expense', amount_minor: 2000, currency: 'GBP', exchange_rate: null,
    description: 'Taxi', categories: { name: 'Travel' } },
  { spent_at: '2026-09-03', kind: 'income', amount_minor: 100000, currency: 'EUR', exchange_rate: 1,
    categories: { name: 'Salary' } },
  { spent_at: '2026-09-02', kind: 'expense', amount_minor: 1000, currency: 'USD', exchange_rate: '0.9',
    categories: { name: 'Travel' } },
  { spent_at: '2026-09-01', kind: 'expense', amount_minor: 450, currency: 'EUR', exchange_rate: null,
    group_expense_id: 'g', group_expenses: { groups: { name: 'Italy' } } },
]

test('pending foreign rows are listed but never summed', () => {
  const s = buildStatement(txns, 'EUR')
  assert.deepEqual(s.rows.map((r) => r.date), ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05'])
  assert.equal(s.totalIncome, 1000)
  assert.equal(s.totalSpent, 9 + 4.5) // USD 10 @ 0.9 + the base-currency share
  assert.deepEqual(s.byCategory, { Travel: 9, Italy: 4.5 })
  const gbp = s.rows.find((r) => r.currency === 'GBP')
  assert.equal(gbp.base_amount, null)
  assert.equal(gbp.amount, 20)
  assert.equal(s.rows.find((r) => r.currency === 'JPY').amount, 1500) // zero-decimal
  assert.deepEqual(s.pending, { count: 2, currencies: ['GBP', 'JPY'] })
})

test('a base-currency row with no rate is simply itself (rate 1), not pending', () => {
  const s = buildStatement([txns[4]], 'EUR')
  assert.equal(s.rows[0].base_amount, 4.5)
  assert.equal(s.pending.count, 0)
})

test('pendingNote', () => {
  assert.equal(pendingNote({ count: 0, currencies: [] }), null)
  assert.equal(pendingNote({ count: 1, currencies: ['GBP'] }),
    '1 transaction in GBP awaits an exchange rate and isn’t in the totals.')
  assert.equal(pendingNote({ count: 3, currencies: ['GBP', 'JPY'] }),
    '3 transactions in GBP, JPY await an exchange rate and aren’t in the totals.')
})

// ---------------------------------------------------------------------------
// Yearly subscriptions follow the app's setting (profiles.yearly_separate).
// my_transactions(p_spread => true) for 2026-09-01..2026-09-30, newest first:
// a €120 yearly gym paid on 15 Mar (before the period; its part 6 falls on
// 15 Sep), a €240.05 yearly insurance paid in the period on 10 Sep, a pending
// ¥12,000 yearly plan paid 31 Jan (part 7 on 30 Sep — clamped like
// spreadDates) and a plain €50 grocery shop.
// ---------------------------------------------------------------------------
const yearlyTxns = [
  { id: 'food', spent_at: '2026-09-20', kind: 'expense', amount_minor: 5000, currency: 'EUR', exchange_rate: 1,
    categories: { name: 'Food' } },
  { id: 'ins', spent_at: '2026-09-10', kind: 'expense', amount_minor: 24005, currency: 'EUR', exchange_rate: 1,
    spread_months: 12, description: 'Insurance', categories: { name: 'Bills' } },
  { id: 'gym', spent_at: '2026-03-15', kind: 'expense', amount_minor: 12000, currency: 'EUR', exchange_rate: 1,
    spread_months: 12, description: 'Gym', categories: { name: 'Sport' } },
  { id: 'yen', spent_at: '2026-01-31', kind: 'expense', amount_minor: 12000, currency: 'JPY', exchange_rate: null,
    spread_months: 12, description: 'Cloud', categories: { name: 'Bills' } },
]
const SEP = { from: '2026-09-01', to: '2026-09-30' }

test('yearly spread (default): parts in the period count, the list shows payments in it', () => {
  const s = buildStatement(yearlyTxns, 'EUR', SEP)
  // Listed: only the rows paid in the period, the yearly one marked.
  assert.deepEqual(s.rows.map((r) => r.description || r.category), ['Insurance', 'Food'])
  assert.equal(s.rows[0].base_amount, 240.05) // the real payment
  assert.equal(yearlyLabel(s.rows[0]), 'Yearly · ≈20.01 EUR/mo') // 24005 = 20.01 ×5 + 20.00 ×7
  assert.equal(yearlyLabel(s.rows[1]), null)
  // Totals: €50 + insurance part 0 (€20.01) + gym part 6 (€10, paid before the period).
  assert.equal(s.totalSpent, 80.01)
  assert.deepEqual(s.byCategory, { Food: 50, Bills: 20.01, Sport: 10 })
  // The pending ¥ plan would add its September part: listed as pending, not summed.
  assert.deepEqual(s.pending, { count: 1, currencies: ['JPY'] })
  assert.equal(s.yearly, null)
  assert.equal(s.yearlyMode, 'spread')
  assert.match(yearlyNote(s.yearlyMode), /month by month, including charges paid before this period/)
})

test('yearly spread: period boundaries use the exact part dates', () => {
  // Gym part 6 is on 15 Sep: a period ending the 14th or starting the 16th misses it.
  const gym = [yearlyTxns[2]]
  assert.equal(buildStatement(gym, 'EUR', { from: '2026-09-01', to: '2026-09-14' }).totalSpent, 0)
  assert.equal(buildStatement(gym, 'EUR', { from: '2026-09-16', to: '2026-10-14' }).totalSpent, 0)
  assert.equal(buildStatement(gym, 'EUR', { from: '2026-09-15', to: '2026-09-15' }).totalSpent, 10)
  // A whole year from the payment counts it all, to the cent (remainder early).
  const ins = [yearlyTxns[1]]
  assert.equal(buildStatement(ins, 'EUR', { from: '2026-09-10', to: '2027-09-09' }).totalSpent, 240.05)
  const firstFive = buildStatement(ins, 'EUR', { from: '2026-09-01', to: '2027-01-31' })
  assert.equal(firstFive.totalSpent, 100.05) // 5 × 20.01
  // The part after the last month is outside the spread.
  assert.equal(buildStatement(ins, 'EUR', { from: '2027-09-10', to: '2027-12-31' }).totalSpent, 0)
  // A clamped part date (31 Jan → 30 Sep) is inside a period ending the 30th.
  const yen = [{ ...yearlyTxns[3], exchange_rate: 0.0062 }] // ¥12,000 = €74.40 → €6.20 a month
  assert.equal(buildStatement(yen, 'EUR', { from: '2026-09-30', to: '2026-09-30' }).totalSpent, 6.2)
  assert.equal(buildStatement(yen, 'EUR', { from: '2026-09-01', to: '2026-09-29' }).totalSpent, 0)
  // No yearly row in range: no note.
  const none = buildStatement([yearlyTxns[0]], 'EUR', SEP)
  assert.equal(none.yearlyMode, null)
  assert.equal(yearlyNote(none.yearlyMode), null)
})

test('yearly kept separate: out of the totals, in their own section', () => {
  const rules = [
    { is_active: true, kind: 'expense', frequency: 'yearly', interval_n: 1, amount_minor: 12000, currency: 'EUR',
      next_run: '2027-03-15', description: 'Gym' },
    { is_active: true, kind: 'expense', frequency: 'yearly', interval_n: 2, amount_minor: 10000, currency: 'USD',
      next_run: '2026-12-01', categories: { name: 'Software' } },
    { is_active: true, kind: 'expense', frequency: 'monthly', interval_n: 1, amount_minor: 999, currency: 'EUR',
      next_run: '2026-10-01' },
    { is_active: false, kind: 'expense', frequency: 'yearly', interval_n: 1, amount_minor: 5000, currency: 'EUR',
      next_run: '2026-10-01' },
  ]
  const rates = { USD: 0.9 }
  const s = buildStatement(yearlyTxns, 'EUR', { ...SEP, separateYearly: true, rules, rates })
  // Still listed and marked; only the plain €50 is in the totals.
  assert.deepEqual(s.rows.map((r) => r.description || r.category), ['Insurance', 'Food'])
  assert.equal(yearlyLabel(s.rows[0]), 'Yearly · ≈20.01 EUR/mo')
  assert.equal(s.totalSpent, 50)
  assert.deepEqual(s.byCategory, { Food: 50 })
  // The earlier pending ¥ plan counts nowhere, so nothing is pending.
  assert.deepEqual(s.pending, { count: 0, currencies: [] })
  assert.equal(s.yearlyMode, 'separate')
  assert.match(yearlyNote(s.yearlyMode), /kept out of the totals/)
  // The section: the period's payments and the Home card's figures.
  assert.deepEqual(s.yearly.payments.map((r) => r.description), ['Insurance'])
  assert.equal(s.yearly.paidTotal, 240.05)
  // Foreign rules at the latest rate, as the card counts them: $100 every 2
  // years at 0.9 = €90 → €45 a year.
  const card = subscriptionGroups(rules, 'EUR', { rates }).find((g) => g.key === 'yearly')
  assert.equal(s.yearly.perYear, card.total / 100)
  assert.equal(s.yearly.perYear, 120 + 45)
  assert.equal(s.yearly.perMonth, card.perMonth / 100)
  assert.equal(s.yearly.perMonth, 10 + 3.75)
  assert.deepEqual(s.yearly.notes, ['Other currencies converted at today’s rate.'])
  const sheet = statementSheets(s, 'EUR', []).find((x) => x.name === 'Yearly subscriptions')
  assert.ok(sheet.rows.some((r) => r[0] === 'Other currencies converted at today’s rate.'))
  assert.deepEqual(s.yearly.rules.map((r) => [r.name, r.nextRun, r.amount, r.perYear]),
    [['Software', '2026-12-01', 100, 50], ['Gym', '2027-03-15', 120, 120]])
})

test('yearly kept separate: a rule with no rate is left out of the cost and named, as in the app', () => {
  const rules = [
    { is_active: true, kind: 'expense', frequency: 'yearly', interval_n: 1, amount_minor: 12000, currency: 'EUR',
      next_run: '2027-03-15', description: 'Gym' },
    { is_active: true, kind: 'expense', frequency: 'yearly', interval_n: 1, amount_minor: 2999, currency: 'PLN',
      next_run: '2026-12-01', description: 'Music' },
    { is_active: true, kind: 'expense', frequency: 'yearly', interval_n: 1, amount_minor: 5000, currency: 'JPY',
      next_run: '2026-11-01', description: 'App' },
  ]
  const rates = { JPY: 0.0062 } // no PLN rate in the server's cache
  const s = buildStatement([], 'EUR', { ...SEP, separateYearly: true, rules, rates })
  // ¥5000 × 0.0062 = €31.00; the PLN rule counts nowhere (never at face value).
  assert.equal(s.yearly.perYear, 120 + 31)
  assert.deepEqual(s.yearly.notes, [
    'Other currencies converted at today’s rate.',
    '29.99 PLN not included — no exchange rate right now.',
  ])
  // Still listed, in its own currency.
  assert.deepEqual(s.yearly.rules.map((r) => [r.name, r.currency, r.amount]),
    [['App', 'JPY', 5000], ['Music', 'PLN', 29.99], ['Gym', 'EUR', 120]])
  const card = subscriptionGroups(rules, 'EUR', { rates }).find((g) => g.key === 'yearly')
  assert.equal(s.yearly.perYear, card.total / 100)
  assert.deepEqual(card.missing.map((r) => r.description), ['Music'])
  // All in the base currency: no notes, nothing converted.
  const same = buildStatement([], 'EUR', { ...SEP, separateYearly: true, rules: [rules[0]] })
  assert.deepEqual(same.yearly.notes, [])
  assert.equal(same.yearly.perYear, 120)
  // A zero-decimal base: $10.00 at 150.123 = ¥1501 (rounded), whole yen.
  const yen = buildStatement([], 'JPY', { ...SEP, separateYearly: true, rates: { USD: 150.123 },
    rules: [{ ...rules[0], currency: 'USD', amount_minor: 1000 }] })
  assert.equal(yen.yearly.perYear, 1501)
})

test('yearly kept separate: a pending yearly payment is listed as pending, not totalled', () => {
  const yen = { ...yearlyTxns[3], spent_at: '2026-09-05' }
  const s = buildStatement([yen, yearlyTxns[0]], 'EUR', { ...SEP, separateYearly: true })
  assert.equal(s.totalSpent, 50)
  assert.deepEqual(s.pending, { count: 1, currencies: ['JPY'] })
  assert.equal(s.yearly.payments.length, 1)
  assert.equal(s.yearly.payments[0].base_amount, null)
  assert.equal(s.yearly.paidTotal, 0)
  assert.equal(yearlyLabel(s.yearly.payments[0]), 'Yearly · 1000 JPY/mo')
  // Without rules or payments there's no section note.
  const plain = buildStatement([yearlyTxns[0]], 'EUR', { ...SEP, separateYearly: true })
  assert.equal(plain.yearlyMode, null)
})

test('an every-2-years row spreads over 24 months and says so', () => {
  const row = { spent_at: '2026-09-01', kind: 'expense', amount_minor: 24000, currency: 'EUR', exchange_rate: 1,
    spread_months: 24 }
  const s = buildStatement([row], 'EUR', SEP)
  assert.equal(s.totalSpent, 10)
  assert.equal(yearlyLabel(s.rows[0]), 'Every 2 years · 10.00 EUR/mo')
})
