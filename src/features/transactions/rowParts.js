// What a transaction row in a list says (TransactionList, and the native
// app's lists): its title, the parts of the muted line under it, the amount
// with its sign and tone, and a foreign amount's value in the base currency.
// Pure, in the app's language; unit-tested in test/rowParts.test.js.
import { baseEquivalent, formatMoney, formatSigned, rateText } from '../../shared/lib/currency.js'
import { shortDate } from '../../shared/lib/dates.js'
import { groupLabel } from '../../shared/lib/txnRollup.js'
import { monthlyShare } from '../../shared/lib/spread.js'
import { countsForLabel } from '../../shared/lib/salaryShift.js'
import { savingsNoteLabel } from '../../shared/lib/savings.js'
import { categoryDisplayName, entryName } from '../../shared/lib/categoryName.js'
import { categoryLook } from '../../shared/lib/categoryStyle.js'
import { t } from '../../shared/lib/i18n/i18n.js'
import { frequencyLabel } from '../recurring/recurringMath.js'

// `kind` is the list's (a row without its own kind takes it); `salaryShift`
// and `savingsIds` are the user's (salaryShiftOf, savingsIdsOf).
//   title      its description, else its category's name, else Expense/Income
//   shared     a group's share (read-only here: edited in the group)
//   kind       'income' | 'expense' (what its styling follows)
//   look       its category's badge (categoryLook)
//   meta       the muted line's start, in order: the date, the category
//              (when the title is the description), where savings came from
//   notes      the notes, next on that line (in italics)
//   group      the group's tag on a share
//   repeats    "Repeats every month" (with "(paused)"), for a rule's entry
//   spread     a yearly payment's "€8.00/month over 12 months" (≈ when uneven)
//   countsFor  a late salary's "Counts for October"
//   amount     signed: income with a plus; `tone` positive for income
//   approx     a foreign amount in the base currency ("≈ €9.00"), with its
//              `rate` and whether the rate is `estimated` on this device
export function rowParts(row, { kind, baseCurrency, salaryShift = null, savingsIds = new Set() }) {
  const rk = (row.kind ?? kind) === 'income' ? 'income' : 'expense'
  const shared = !!row.group_expense_id
  const conv = baseEquivalent(row.amount_minor, row.exchange_rate, row.currency, baseCurrency)
  const share = monthlyShare(row)
  const category = row.description && row.categories?.name ? categoryDisplayName(row.categories) : null
  const saved = savingsNoteLabel(row, savingsIds)
  return {
    id: row.id,
    title: entryName(row, t(`transactions:kinds.${rk}`)),
    shared,
    kind: rk,
    look: categoryLook(row.categories, rk),
    meta: [shortDate(row.spent_at), category, saved].filter(Boolean),
    notes: row.notes || null,
    group: shared ? groupLabel(row) : null,
    repeats: row.recurring
      ? `${t('transactions:list.repeats', { frequency: frequencyLabel(row.recurring) })}${
        row.recurring.is_active ? '' : ` ${t('transactions:list.paused')}`}`
      : null,
    spread: share
      ? `${share.exact ? '' : '≈ '}${t('transactions:list.spread', { amount: formatMoney(share.perMonth, row.currency), months: share.months })}`
      : null,
    countsFor: countsForLabel(row, salaryShift),
    amount: formatSigned(row.amount_minor, row.currency, { plus: rk === 'income' }),
    tone: rk === 'income' ? 'positive' : 'default',
    approx: conv ? t('transactions:list.approx', { amount: formatMoney(conv.baseMinor, baseCurrency) }) : null,
    rate: conv ? rateText(conv.rate) : null,
    estimated: conv && row.rate_estimated ? t('transactions:list.estimated') : null,
  }
}

// Every row of a list, with the same options.
export const listParts = (rows, options) => rows.map((row) => rowParts(row, options))
