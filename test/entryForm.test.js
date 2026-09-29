import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ENTRY_FIELDS, entryColumns, entryErrors, formFromRow, newForm,
} from '../src/features/transactions/entryForm.js'
import { ruleFromForm, ruleToForm } from '../src/features/recurring/ruleForm.js'
import { editRepeat, planRepeat, repeatDraft } from '../src/features/recurring/recurringMath.js'
import { firstInvalid } from '../src/shared/lib/formChecks.js'

// ---- The shared entry form (Add and a rule's page) ---------------------------

test('newForm: a new entry in the base currency, or what was typed elsewhere', () => {
  assert.deepEqual(newForm({ kind: 'income', baseCurrency: 'GBP', date: '2026-09-29' }), {
    kind: 'income', amount: '', currency: 'GBP', currencyPicked: false, categoryId: '', description: '',
    date: '2026-09-29', fromIncome: true, paidFrom: 'bank',
  })
  const carried = newForm({
    baseCurrency: 'EUR', date: '2026-09-29',
    initial: { amount: '12.5', currency: 'USD', currencyPicked: true, description: 'Taxi', spentAt: '2026-09-20' },
  })
  assert.equal(carried.kind, 'expense')
  assert.equal(carried.amount, '12.5')
  assert.equal(carried.currency, 'USD')
  assert.equal(carried.currencyPicked, true)
  assert.equal(carried.description, 'Taxi')
  assert.equal(carried.date, '2026-09-20')
})

test('formFromRow: a saved transaction or rule, amounts shown as typed, the date given', () => {
  const txn = {
    kind: 'expense', amount_minor: 1299, currency: 'EUR', category_id: 'c1', description: null,
    spent_at: '2026-09-10', paid_with_vouchers: true,
  }
  assert.deepEqual(formFromRow(txn, txn.spent_at), {
    kind: 'expense', amount: '12.99', currency: 'EUR', currencyPicked: false, categoryId: 'c1', description: '',
    date: '2026-09-10', fromIncome: false, paidFrom: 'vouchers',
  })
  const yen = formFromRow({ kind: 'income', amount_minor: 1800, currency: 'JPY', savings_from_income: true }, 'x')
  assert.equal(yen.amount, '1800')
  assert.equal(yen.categoryId, '')
  assert.equal(yen.fromIncome, true)
  assert.equal(yen.paidFrom, 'bank')
})

test('entryErrors: amount and date are required, in that order', () => {
  assert.deepEqual(ENTRY_FIELDS, ['amount', 'date'])
  assert.deepEqual(entryErrors({ amount: '4.5', date: '2026-09-01' }), {})
  const both = entryErrors({ amount: '0', date: ' ' })
  assert.deepEqual(Object.keys(both), ['amount', 'date'])
  assert.equal(firstInvalid(both, ENTRY_FIELDS), 'amount')
  assert.equal(firstInvalid(entryErrors({ amount: '3', date: '' }), ENTRY_FIELDS), 'date')
})

test('entryColumns: the shared columns; an empty description stays empty', () => {
  const form = newForm({ date: '2026-09-29' })
  assert.deepEqual(entryColumns({ ...form, amount: '9.99', description: '  ', paidFrom: 'savings' }), {
    category_id: null, amount_minor: 999, currency: 'EUR', description: null,
    savings_from_income: false, paid_from_savings: true, paid_with_vouchers: false,
  })
  assert.equal(entryColumns({ ...form, amount: '5', description: ' Coffee ' }).description, 'Coffee')
  assert.equal(entryColumns({ ...form, amount: '5', paidFrom: 'vouchers' }).paid_with_vouchers, true)
  // "Taken from my income" only for income in a savings category.
  const income = { ...form, kind: 'income', amount: '100', categoryId: 's1', paidFrom: 'savings' }
  assert.equal(entryColumns(income, { isSavings: true }).savings_from_income, true)
  assert.equal(entryColumns(income, { isSavings: false }).savings_from_income, false)
  assert.equal(entryColumns({ ...income, fromIncome: false }, { isSavings: true }).savings_from_income, false)
  // "Paid from" is for expenses only.
  assert.equal(entryColumns(income, { isSavings: true }).paid_from_savings, false)
})

// ---- A recurring rule in that form ------------------------------------------

const rule = {
  id: 'r1', kind: 'expense', amount_minor: 1499, currency: 'USD', category_id: 'c1', description: 'Netflix',
  savings_from_income: false, paid_from_savings: true, frequency: 'monthly', interval_n: 3, next_run: '2026-10-10',
  end_date: '2027-06-30', remind_days_before: 2, is_active: false,
}

test('ruleToForm: the date field is the next charge; the draft holds the schedule', () => {
  const { form, draft } = ruleToForm(rule)
  assert.equal(form.date, '2026-10-10')
  assert.equal(form.amount, '14.99')
  assert.equal(form.currency, 'USD')
  assert.equal(form.paidFrom, 'savings')
  assert.equal(draft.choice, 'quarterly')
  assert.equal(draft.remind, true)
  assert.equal(draft.active, false)
})

test('ruleFromForm: an unchanged rule saves back exactly as it was', () => {
  const { form, draft } = ruleToForm(rule)
  const stored = Object.fromEntries(Object.entries(rule).filter(([k]) => k !== 'id'))
  assert.deepEqual(ruleFromForm(form, draft), stored)
})

test('ruleFromForm: the date field moves the next charge; no vouchers, no notes, no rate', () => {
  const { form, draft } = ruleToForm(rule)
  const saved = ruleFromForm({ ...form, date: '2026-11-01', paidFrom: 'vouchers', description: '' },
    editRepeat(draft, { choice: 'yearly', n: '1', remind: false, active: true }))
  assert.equal(saved.next_run, '2026-11-01')
  assert.equal(saved.frequency, 'yearly')
  assert.equal(saved.remind_days_before, null)
  assert.equal(saved.is_active, true)
  assert.equal(saved.description, null) // named after its category, like Add
  assert.equal(saved.paid_from_savings, false)
  for (const k of ['paid_with_vouchers', 'notes', 'exchange_rate', 'spent_at']) assert.equal(k in saved, false, k)
})

test('ruleFromForm: savings income keeps "taken from my income"; switching kind drops the other flag', () => {
  const income = { ...rule, kind: 'income', paid_from_savings: false, savings_from_income: true, category_id: 's1' }
  const { form, draft } = ruleToForm(income)
  assert.equal(ruleFromForm(form, draft, { isSavings: true }).savings_from_income, true)
  assert.equal(ruleFromForm({ ...form, fromIncome: false }, draft, { isSavings: true }).savings_from_income, false)
  const { form: exp, draft: d2 } = ruleToForm(rule)
  const asIncome = ruleFromForm({ ...exp, kind: 'income' }, d2)
  assert.equal(asIncome.kind, 'income')
  assert.equal(asIncome.paid_from_savings, false)
})

test('Add and a rule\'s page save the same shared fields for the same form', () => {
  // Add with Repeat on makes its rule from the saved entry (planRepeat); a
  // rule's page saves the rule straight from the form. Same form → same rule.
  const form = { ...newForm({ date: '2026-09-10' }), amount: '12.99', categoryId: 'c1', description: 'Gym', paidFrom: 'savings' }
  const draft = repeatDraft(null, { fromDate: form.date })
  const entry = { ...entryColumns(form), kind: 'expense', spent_at: form.date, client_uuid: 'cu' }
  const viaAdd = planRepeat({ rule: null, repeat: true, draft, before: null, entry }).fields
  const viaRule = ruleFromForm({ ...form, date: draft.nextRun }, draft)
  for (const k of Object.keys(viaRule)) assert.deepEqual(viaAdd[k], viaRule[k], k)
})
