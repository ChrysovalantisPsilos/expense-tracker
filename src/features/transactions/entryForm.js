// The fields every entry form shares (EntryFields.jsx: Add's expense or
// income, and a recurring rule's page), as pure state ↔ row mappings, so both
// forms start, check and save the same way. No React/supabase: unit-tested in
// test/entryForm.test.js.
//
// The form state: { kind, amount, currency, currencyPicked, categoryId,
// description, date, fromIncome, paidFrom } — text fields stay strings so the
// inputs can be empty mid-edit; `date` is the entry's date on Add and the next
// charge on a rule's page; `paidFrom` is 'bank' | 'savings' | 'vouchers'.
import { minorToInput, toMinor } from '../../shared/lib/currency.js'
import { paidFromOf, paidFromSources } from '../../shared/lib/savings.js'
import { amountError, fieldErrors, requiredError } from '../../shared/lib/formChecks.js'
import { t } from '../../shared/lib/i18n/i18n.js'

// A saved row (a transaction or a rule) → the form, its date given by the
// caller (a transaction's spent_at, a rule's next_run). Income in a savings
// category is "Taken from my income" unless the row says otherwise.
export function formFromRow(row, date) {
  return {
    kind: row.kind === 'income' ? 'income' : 'expense',
    amount: minorToInput(row.amount_minor, row.currency),
    currency: row.currency,
    currencyPicked: false,
    categoryId: row.category_id ?? '',
    description: row.description ?? '',
    date,
    fromIncome: !!row.savings_from_income,
    paidFrom: paidFromOf(row),
  }
}

// A new entry: `kind`, in the base currency, dated `date` — or what the user
// already typed elsewhere (`initial`: { amount, currency, currencyPicked,
// description, spentAt }, the Add page's group form). A new savings income is
// "Taken from my income" until switched off.
export function newForm({ kind = 'expense', baseCurrency = 'EUR', date, initial = null }) {
  return {
    kind,
    amount: initial?.amount ?? '',
    currency: initial?.currency ?? baseCurrency,
    currencyPicked: !!initial?.currencyPicked,
    categoryId: '',
    description: initial?.description ?? '',
    date: initial?.spentAt ?? date,
    fromIncome: true,
    paidFrom: 'bank',
  }
}

// The fields a form requires, with their messages: { amount?, date? }.
export const ENTRY_FIELDS = ['amount', 'date']
export function entryErrors({ amount, date }) {
  return fieldErrors({
    amount: amountError(amount),
    date: requiredError(date, t('transactions:form.pickDate')),
  })
}

// What the fields show for a form state (useEntryFields, the native form):
//   isSavings    income in a savings category (0084): "Taken from my income"
//   sources      "Paid from"'s choices for an expense ([] when the bank is
//                the only one): savings once the user has a savings category,
//                meal vouchers when `vouchersOn` and `allowVouchers` (not for
//                a rule, nor an entry set to repeat); the one the entry was
//                saved with (`startPaidFrom`) stays offered
//   from         the choice shown: the form's, or the bank when it isn't offered
//   amountMinor  the amount in minor units (0 while empty or not above zero)
// `savingsIds` is the Set of the user's savings categories.
export function entryDerived(form, { savingsIds, vouchersOn = false, allowVouchers = true, startPaidFrom = 'bank' }) {
  const sources = form.kind === 'expense' ? paidFromSources({
    savings: savingsIds.size > 0 || startPaidFrom === 'savings',
    vouchers: allowVouchers && (vouchersOn || startPaidFrom === 'vouchers'),
  }) : []
  return {
    isSavings: form.kind === 'income' && savingsIds.has(form.categoryId),
    sources,
    from: sources.includes(form.paidFrom) ? form.paidFrom : 'bank',
    amountMinor: Number(form.amount) > 0 ? toMinor(form.amount, form.currency) : 0,
  }
}

// What Add/Edit saves for a transaction: the shared columns, the rate
// captured now (so a balance never shifts with later rates), the notes and
// the date. `values` is the form with "Paid from" as shown.
export function entrySaveFields(values, { isSavings = false, rate, notes = '' }) {
  return {
    ...entryColumns(values, { isSavings }),
    exchange_rate: rate,
    notes: notes || null,
    spent_at: values.date,
  }
}

// The form → the columns a transaction and a rule share. An empty description
// stays empty: lists name the entry after its category (entryName).
// `isSavings`: the category is a savings one (only then is income "taken from
// my income"); "Paid from" applies to expenses only.
export function entryColumns(form, { isSavings = false } = {}) {
  const expense = form.kind === 'expense'
  return {
    category_id: form.categoryId || null,
    amount_minor: toMinor(form.amount, form.currency),
    currency: form.currency,
    description: form.description.trim() || null,
    savings_from_income: form.kind === 'income' && isSavings && !!form.fromIncome,
    paid_from_savings: expense && form.paidFrom === 'savings',
    paid_with_vouchers: expense && form.paidFrom === 'vouchers',
  }
}
