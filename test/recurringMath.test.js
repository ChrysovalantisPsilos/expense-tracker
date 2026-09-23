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

// ---- Make recurring: next charge one period after the transaction ----------
import { nextRunAfter, ruleFromTransaction, canMakeRecurring } from '../src/features/recurring/recurringMath.js'

test('nextRunAfter: one period later, as the SQL materializer steps', () => {
  assert.equal(nextRunAfter('2026-09-01', 'monthly'), '2026-10-01') // rent on the 1st
  assert.equal(nextRunAfter('2026-09-01', 'weekly'), '2026-09-08')
  assert.equal(nextRunAfter('2026-12-28', 'weekly'), '2027-01-04') // across a year
  assert.equal(nextRunAfter('2026-09-30', 'daily'), '2026-10-01')
  assert.equal(nextRunAfter('2026-09-01', 'yearly'), '2027-09-01')
  assert.equal(nextRunAfter('2026-09-15', 'weekly', 2), '2026-09-29')
  assert.equal(nextRunAfter('2026-11-30', 'monthly', 3), '2027-02-28')
})

test('nextRunAfter: month ends clamp to the shorter month (Postgres date + interval)', () => {
  assert.equal(nextRunAfter('2026-01-31', 'monthly'), '2026-02-28')
  assert.equal(nextRunAfter('2028-01-31', 'monthly'), '2028-02-29') // leap year
  assert.equal(nextRunAfter('2026-03-31', 'monthly'), '2026-04-30')
  assert.equal(nextRunAfter('2026-08-31', 'monthly'), '2026-09-30')
  assert.equal(nextRunAfter('2028-02-29', 'yearly'), '2029-02-28')
  assert.equal(nextRunAfter('2027-02-28', 'yearly'), '2028-02-28')
  assert.equal(nextRunAfter('2028-02-28', 'weekly'), '2028-03-06')
})

test('ruleFromTransaction: carries the entry over; next charge after its date', () => {
  const t = {
    id: 't1', kind: 'expense', amount_minor: 85000, currency: 'EUR', exchange_rate: 1,
    category_id: 'c1', account_id: null, description: 'Rent', spent_at: '2026-09-01', notes: 'x',
  }
  assert.deepEqual(ruleFromTransaction(t, { frequency: 'monthly', interval_n: 1 }), {
    kind: 'expense', amount_minor: 85000, currency: 'EUR', category_id: 'c1', account_id: null,
    description: 'Rent', frequency: 'monthly', interval_n: 1, next_run: '2026-10-01',
    source_transaction_id: 't1',
  })
  // A foreign-currency entry keeps its currency; no rate is stored on the rule.
  const gbp = ruleFromTransaction({ ...t, currency: 'GBP', exchange_rate: 1.17, spent_at: '2026-01-31' })
  assert.equal(gbp.currency, 'GBP')
  assert.equal(gbp.next_run, '2026-02-28')
  assert.ok(!('exchange_rate' in gbp))
  // A just-saved entry (no id on the client yet) links through its client_uuid.
  const fresh = ruleFromTransaction({ ...t, id: undefined, client_uuid: 'cu1' })
  assert.equal(fresh.source_client_uuid, 'cu1')
  assert.ok(!('source_transaction_id' in fresh))
  assert.ok(!('source_client_uuid' in ruleFromTransaction({ ...t, id: undefined })))
})

test('canMakeRecurring: not group shares, not rows that already belong to a rule', () => {
  assert.equal(canMakeRecurring({ id: 1 }), true)
  assert.equal(canMakeRecurring({ id: 1, group_expense_id: 'g' }), false)
  assert.equal(canMakeRecurring({ id: 1, recurring_rule_id: 'r' }), false)
  assert.equal(canMakeRecurring(null), false)
})

test('stepping chains from the clamped date like the materializer: 31 Mar is not restored', () => {
  const chain = (iso, f, k) => Array.from({ length: k }).reduce((acc) => [...acc, nextRunAfter(acc.at(-1), f)], [iso])
  assert.deepEqual(chain('2026-01-31', 'monthly', 3), ['2026-01-31', '2026-02-28', '2026-03-28', '2026-04-28'])
  assert.deepEqual(chain('2028-01-31', 'monthly', 2), ['2028-01-31', '2028-02-29', '2028-03-29'])
  assert.deepEqual(chain('2024-02-29', 'yearly', 2), ['2024-02-29', '2025-02-28', '2026-02-28'])
})

test('expectedInWindow: month-end rules follow the same clamped chain', () => {
  const rule = { is_active: true, kind: 'expense', amount_minor: 100, frequency: 'monthly', interval_n: 1, next_run: '2026-01-31' }
  // Charges on 31 Jan, 28 Feb, 28 Mar: 28 Mar is in March's window, 31 Mar is not a charge.
  assert.deepEqual(expectedInWindow([rule], '2026-03-01', '2026-03-31'), { expense: 100, income: 0 })
  assert.deepEqual(expectedInWindow([rule], '2026-03-29', '2026-03-31'), { expense: 0, income: 0 })
  assert.deepEqual(expectedInWindow([rule], '2026-02-01', '2026-02-28'), { expense: 100, income: 0 })
})

// ---- Yearly expenses spread over the months they cover (0067) ---------------
import { monthlyBudgetShare } from '../src/features/recurring/recurringMath.js'

test('expectedInWindow: an upcoming yearly expense counts only its parts in the window', () => {
  const rules = [
    { is_active: true, kind: 'expense', amount_minor: 12005, frequency: 'yearly', interval_n: 1, next_run: '2026-07-20', end_date: null },
    { is_active: true, kind: 'income', amount_minor: 60000, frequency: 'yearly', interval_n: 1, next_run: '2026-07-20', end_date: null },
  ]
  // 12005 / 12 = 1000 r 5: July (the first part) gets 1001. Income isn't spread.
  assert.deepEqual(expectedInWindow(rules, '2026-07-15', '2026-07-31'), { expense: 1001, income: 60000 })
  // Jul..Dec: 5 parts of 1001 + 1 of 1000.
  assert.deepEqual(expectedInWindow(rules, '2026-07-15', '2026-12-31'), { expense: 5 * 1001 + 1000, income: 60000 })
  // A charge next month adds nothing to this month.
  assert.deepEqual(expectedInWindow([{ ...rules[0], next_run: '2026-08-02' }], '2026-07-15', '2026-07-31'),
    { expense: 0, income: 0 })
})

test('monthlyBudgetShare: yearly expense rules only, first part and whether it is even', () => {
  assert.deepEqual(monthlyBudgetShare({ kind: 'expense', frequency: 'yearly', interval_n: 1, amount_minor: 12000 }),
    { perMonth: 1000, months: 12, exact: true })
  assert.deepEqual(monthlyBudgetShare({ kind: 'expense', frequency: 'yearly', interval_n: 2, amount_minor: 10000 }),
    { perMonth: 417, months: 24, exact: false })
  assert.equal(monthlyBudgetShare({ kind: 'income', frequency: 'yearly', interval_n: 1, amount_minor: 12000 }), null)
  assert.equal(monthlyBudgetShare({ kind: 'expense', frequency: 'monthly', interval_n: 12, amount_minor: 12000 }), null)
})
