import { toBaseMinor, toMinor } from '../../shared/lib/currency.js'
import { netSign, rowEffect } from '../../shared/lib/savings.js'
import { NO_CATEGORY, categoryDisplayName } from '../../shared/lib/categoryName.js'

// Pure search/filter logic behind the Transactions page. The server does the
// coarse, indexed filtering (kind, dates, category); free text and the amount
// range are refined here so text can span description, notes and category.

// The page's Expenses / Income / All switch, as it appears in `?type=`.
const TXN_TYPES = ['expense', 'income', 'all']

// `?type=` → a known type; anything missing or unknown means Expenses.
export function parseTxnType(value) {
  return TXN_TYPES.includes(value) ? value : 'expense'
}

// The advanced filters (everything besides the `?q=` text). `shared: '1'`
// keeps only your shares of group expenses (rows with a group_expense_id).
export const EMPTY_FILTERS = { categoryId: '', from: '', to: '', min: '', max: '', shared: '' }

// The value `shared` takes when it's on.
export const SHARED_ONLY = '1'

// Whether the filters keep only group shares, and `filters` with that
// switched on or off (the website's switch, the native app's Groups chip).
export const isSharedOnly = (filters) => filters?.shared === SHARED_ONLY
export const withSharedOnly = (filters, on) => ({ ...filters, shared: on ? SHARED_ONLY : '' })

// The Transactions page's read (listTransactions' options): this month
// (`month`: { from, to }) of the kind, or, while searching, all history
// (up to 1,000 rows) narrowed by the filters the server can apply — the
// dates and a real category ("No category" can't be asked of the server;
// filterTransactions refines it).
export function ledgerRead({ kind, filters = EMPTY_FILTERS, searching, month }) {
  if (!searching) return { kind, from: month.from, to: month.to }
  return {
    kind,
    from: filters.from || undefined,
    to: filters.to || undefined,
    categoryId: filters.categoryId && filters.categoryId !== NO_CATEGORY ? filters.categoryId : undefined,
    limit: 1000,
  }
}

// True when the text or any advanced filter narrows the list — the page then
// searches all history instead of showing just this month.
export function isFiltering(text, filters) {
  return text.trim() !== '' || Object.keys(EMPTY_FILTERS).some((k) => filters[k] !== '')
}

// Rows whose description, notes or category name contain `text` (any case)
// and whose base-currency amount sits within [min, max] (decimal strings in
// the base currency; '' means unbounded). `categoryId: NO_CATEGORY` keeps only
// uncategorised personal rows (any other category is filtered server-side);
// `shared: SHARED_ONLY` only your shares of group expenses.
export function filterTransactions(rows, { text = '', min = '', max = '', categoryId = '', shared = '' }, baseCurrency) {
  const q = text.trim().toLowerCase()
  const minBase = min !== '' ? toMinor(min, baseCurrency) : null
  const maxBase = max !== '' ? toMinor(max, baseCurrency) : null
  return rows.filter((r) => {
    if (categoryId === NO_CATEGORY && (r.category_id || r.group_expense_id)) return false
    if (shared === SHARED_ONLY && !r.group_expense_id) return false
    if (q) {
      const hay = `${r.description ?? ''} ${r.notes ?? ''} ${r.categories?.name ?? ''} ${categoryDisplayName(r.categories)}`.toLowerCase()
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
// same net as Home's: savings (in `savingsIds`, 0084) aren't income, those
// taken from income take away, and expenses paid from savings (0085) don't
// (rowEffect / netSign).
export function netBaseMinor(rows, baseCurrency, savingsIds = new Set()) {
  return rows.reduce((s, r) => {
    const b = toBaseMinor(r.amount_minor, r.exchange_rate, r.currency, baseCurrency)
    return s + netSign(rowEffect(r, savingsIds)) * b
  }, 0)
}
