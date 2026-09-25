import { toBaseMinor, toMinor } from '../../shared/lib/currency.js'
import { netSign, rowEffect } from '../../shared/lib/savings.js'

// Pure search/filter logic behind the Transactions page. The server does the
// coarse, indexed filtering (kind, dates, category); free text and the amount
// range are refined here so text can span description, notes and category.

// The page's Expenses / Income / All switch, as it appears in `?type=`.
const TXN_TYPES = ['expense', 'income', 'all']

// `?type=` → a known type; anything missing or unknown means Expenses.
export function parseTxnType(value) {
  return TXN_TYPES.includes(value) ? value : 'expense'
}

// `categoryId` value for personal expenses with no category — the breakdowns'
// "Uncategorized" bucket (a group share buckets under its group instead). The
// server can't filter on "no category", so it's refined here.
export const NO_CATEGORY = 'none'

// The advanced filters (everything besides the `?q=` text).
export const EMPTY_FILTERS = { categoryId: '', from: '', to: '', min: '', max: '' }

// True when the text or any advanced filter narrows the list — the page then
// searches all history instead of showing just this month.
export function isFiltering(text, filters) {
  return text.trim() !== '' || Object.keys(EMPTY_FILTERS).some((k) => filters[k] !== '')
}

// Rows whose description, notes or category name contain `text` (any case)
// and whose base-currency amount sits within [min, max] (decimal strings in
// the base currency; '' means unbounded). `categoryId: NO_CATEGORY` keeps only
// uncategorised personal rows (any other category is filtered server-side).
export function filterTransactions(rows, { text = '', min = '', max = '', categoryId = '' }, baseCurrency) {
  const q = text.trim().toLowerCase()
  const minBase = min !== '' ? toMinor(min, baseCurrency) : null
  const maxBase = max !== '' ? toMinor(max, baseCurrency) : null
  return rows.filter((r) => {
    if (categoryId === NO_CATEGORY && (r.category_id || r.group_expense_id)) return false
    if (q) {
      const hay = `${r.description ?? ''} ${r.notes ?? ''} ${r.categories?.name ?? ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    if (minBase != null || maxBase != null) {
      const base = toBaseMinor(r.amount_minor, r.exchange_rate, r.currency, baseCurrency)
      if (minBase != null && base < minBase) return false
      if (maxBase != null && base > maxBase) return false
    }
    return true
  })
}

// Income minus expenses across `rows`, in base-currency minor units — the
// same net as Home's: savings (in `savingsIds`, 0084) aren't income, and those
// taken from income take away (rowEffect / netSign).
export function netBaseMinor(rows, baseCurrency, savingsIds = new Set()) {
  return rows.reduce((s, r) => {
    const b = toBaseMinor(r.amount_minor, r.exchange_rate, r.currency, baseCurrency)
    return s + netSign(rowEffect(r, savingsIds)) * b
  }, 0)
}
