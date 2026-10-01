// The entry form's pure helpers, shared by the web's form components and the
// native app's form (through the mobile core): what the fields show for a
// form state, what a save sends, the exchange-rate line, the Repeat lines,
// the currency list and the amount field's hints.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { entryDerived, entrySaveFields, entryColumns, newForm } from '../src/features/transactions/entryForm.js'
import { fxPreview } from '../src/shared/lib/fxPreview.js'
import {
  repeatChoiceOptions, repeatDraft, repeatNextHelp, repeatShareLine,
} from '../src/features/recurring/recurringMath.js'
import { nextChargeHelp } from '../src/features/recurring/ruleForm.js'
import { CURRENCIES, currencyCodes } from '../src/shared/lib/currency.js'
import { amountFieldHints } from '../src/shared/lib/moneyParse.js'
import { categoryLabels } from '../src/features/ai/aiMath.js'
import { loadLanguage } from '../src/shared/lib/i18n/i18n.js'

const SAV = 'sav-1'
const savingsIds = new Set([SAV])
const form = (over = {}) => ({ ...newForm({ date: '2026-09-15' }), ...over })

test('entryDerived: Paid from offers savings once there is a savings category, vouchers when set up', () => {
  assert.deepEqual(entryDerived(form(), { savingsIds: new Set() }).sources, [])
  assert.deepEqual(entryDerived(form(), { savingsIds }).sources, ['bank', 'savings'])
  assert.deepEqual(entryDerived(form(), { savingsIds, vouchersOn: true }).sources, ['bank', 'savings', 'vouchers'])
  // A rule, or an entry set to repeat, can't pay with vouchers.
  assert.deepEqual(entryDerived(form(), { savingsIds, vouchersOn: true, allowVouchers: false }).sources, ['bank', 'savings'])
  // The choice an entry was saved with stays offered.
  assert.deepEqual(entryDerived(form(), { savingsIds: new Set(), startPaidFrom: 'vouchers' }).sources, ['bank', 'vouchers'])
  // Income has no Paid from.
  assert.deepEqual(entryDerived(form({ kind: 'income' }), { savingsIds, vouchersOn: true }).sources, [])
})

test('entryDerived: the choice shown falls back to the bank; savings income; the amount in minor units', () => {
  assert.equal(entryDerived(form({ paidFrom: 'vouchers' }), { savingsIds }).from, 'bank')
  assert.equal(entryDerived(form({ paidFrom: 'savings' }), { savingsIds }).from, 'savings')
  assert.equal(entryDerived(form({ kind: 'income', categoryId: SAV }), { savingsIds }).isSavings, true)
  assert.equal(entryDerived(form({ kind: 'expense', categoryId: SAV }), { savingsIds }).isSavings, false)
  assert.equal(entryDerived(form({ amount: '12.5' }), { savingsIds }).amountMinor, 1250)
  assert.equal(entryDerived(form({ amount: '1800', currency: 'JPY' }), { savingsIds }).amountMinor, 1800)
  assert.equal(entryDerived(form({ amount: '' }), { savingsIds }).amountMinor, 0)
  assert.equal(entryDerived(form({ amount: '0' }), { savingsIds }).amountMinor, 0)
})

test('entrySaveFields: the shared columns, the captured rate, notes and the date', () => {
  const values = form({ amount: '9.99', currency: 'USD', description: ' Lunch ', date: '2026-09-14' })
  assert.deepEqual(entrySaveFields(values, { rate: 0.91, notes: 'with Sam' }), {
    ...entryColumns(values), exchange_rate: 0.91, notes: 'with Sam', spent_at: '2026-09-14',
  })
  assert.equal(entrySaveFields(values, { rate: 1 }).notes, null)
  assert.equal(entrySaveFields(form({ kind: 'income', amount: '5', categoryId: SAV }), { isSavings: true, rate: 1 })
    .savings_from_income, true)
})

test('fxPreview: loading, the captured rate, the ECB rate, and asking for one', () => {
  const base = { from: 'USD', to: 'EUR', amountMinor: 1000 }
  assert.deepEqual(fxPreview({ ...base, fx: { status: 'loading' } }),
    { status: 'loading', text: 'Looking up the USD→EUR rate…' })
  const captured = fxPreview({ ...base, fx: { status: 'skipped' }, captured: 0.9 })
  assert.equal(captured.status, 'captured')
  assert.equal(captured.text, '$10.00 ≈ €9.00 @ 0.9 (the rate it was saved with)')
  const ecb = fxPreview({ ...base, fx: { status: 'ok', rate: 0.9, date: '2026-09-14' } })
  assert.equal(ecb.status, 'ecb')
  assert.match(ecb.text, /^\$10\.00 ≈ €9\.00 @ 0\.9 on 14 Sep( 2026)? \(ECB\)$/)
  const missing = fxPreview({ ...base, fx: { status: 'missing' }, rate: null })
  assert.equal(missing.status, 'missing')
  assert.equal(missing.label, '1 USD = ? EUR')
  assert.equal(missing.conversion, null)
  assert.equal(fxPreview({ ...base, fx: { status: 'missing' }, rate: 0.9 }).conversion, '$10.00 ≈ €9.00 @ 0.9')
  // No amount yet: the rate alone.
  assert.equal(fxPreview({ ...base, amountMinor: 0, fx: { status: 'missing' }, rate: 0.9 }).conversion, null)
  assert.match(fxPreview({ ...base, amountMinor: 0, fx: { status: 'ok', rate: 0.9, date: '2026-09-14' } }).text,
    /^1 USD = 0\.9 EUR on 14 Sep/)
})

test('repeatNextHelp: only for a new series, saying when a past first repeat is caught up', () => {
  const draft = repeatDraft(null, { fromDate: '2026-09-15' })
  assert.equal(repeatNextHelp({ rule: null, repeat: false, draft, todayISO: '2026-09-15' }), null)
  assert.equal(repeatNextHelp({ rule: { id: 'r' }, repeat: true, draft, todayISO: '2026-09-15' }), null)
  assert.match(repeatNextHelp({ rule: null, repeat: true, draft, todayISO: '2026-09-15' }), /the next is on 15 Oct/)
  assert.match(repeatNextHelp({ rule: null, repeat: true, draft, todayISO: '2026-11-01' }), /missed since then/)
})

test('repeatShareLine: a yearly expense counts monthly in budgets unless kept separate', () => {
  const yearly = { choice: 'yearly', n: '1', kind: 'expense', amountMinor: 9600, currency: 'EUR' }
  assert.equal(repeatShareLine(yearly), 'Counts as €8.00/month in budgets, spread over 12 months.')
  assert.match(repeatShareLine({ ...yearly, amountMinor: 1000 }), /^Counts as about €0\.84/)
  assert.equal(repeatShareLine({ ...yearly, separateYearly: true }), null)
  assert.equal(repeatShareLine({ ...yearly, amountMinor: 0 }), null)
  assert.equal(repeatShareLine({ ...yearly, choice: 'monthly' }), null)
  assert.equal(repeatShareLine({ ...yearly, kind: 'income' }), null)
})

test('repeatChoiceOptions and nextChargeHelp are worded in the app language', async () => {
  assert.deepEqual(repeatChoiceOptions().map((c) => c.value), ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'])
  assert.equal(repeatChoiceOptions()[2].label, 'Monthly')
  assert.equal(nextChargeHelp('2026-09-01', '2026-09-15'), 'Any charges missed since then are added tonight.')
  assert.equal(nextChargeHelp('2026-09-20', '2026-09-15'), null)
  assert.equal(nextChargeHelp('', '2026-09-15'), null)
  await loadLanguage('el')
  try {
    assert.equal(repeatChoiceOptions()[2].label, 'Μηνιαία')
  } finally {
    await loadLanguage('en')
  }
})

test('currencyCodes, amountFieldHints and categoryLabels', () => {
  assert.equal(currencyCodes(), CURRENCIES)
  assert.equal(currencyCodes('EUR'), CURRENCIES)
  assert.deepEqual(currencyCodes('XAF'), ['XAF', ...CURRENCIES])
  assert.deepEqual(amountFieldHints('JPY'), { whole: true, placeholder: '0' })
  assert.deepEqual(amountFieldHints('EUR'), { whole: false, placeholder: '0.00' })
  assert.deepEqual(amountFieldHints(), { whole: false, placeholder: '0.00' })
  assert.deepEqual(categoryLabels([{ id: 'c1', name: 'Groceries', default_key: 'groceries' }, { id: 'c2', name: 'Pets' }]),
    { c1: 'Groceries', c2: 'Pets' })
})
