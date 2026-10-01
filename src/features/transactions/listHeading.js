// The header over a list of transactions (Home's Expenses card, a category's
// page, the Transactions page): a title naming what's listed, and a muted
// subtitle with the period and how many entries it holds — or, for a
// search, how many results. Pure, so the three screens word it the same way,
// in the app's language (transactions:heading.*).
import { t } from '../../shared/lib/i18n/i18n.js'
import { formatSigned } from '../../shared/lib/currency.js'

// A list of one kind is titled by it; any other list is "All transactions".
const titleOf = (kind, savings) => (savings && kind === 'income' ? 'savings'
  : kind === 'expense' || kind === 'income' ? kind : 'all')

// "3 entries", or with `noun` 'result' "3 results".
export const countLabel = (n, noun = 'entry') => t(`transactions:heading.${noun}`, { count: n })

//   kind        'expense' | 'income' | undefined (every kind)
//   savings     the entries are a savings category's (0084): "Savings", not
//               "Income", matching the page's "Saved" total
//   periodLabel e.g. 'This month'
//   count       entries listed (ignored while loading, or when the list
//               failed to load — `failed` — so it never reads "0 entries")
//   searching   a search/filter is on: "Search results" + "N results"
export function listHeading({
  kind, savings = false, periodLabel, count, loading = false, failed = false, searching = false,
}) {
  const unknown = loading || failed || count == null
  if (searching) {
    return {
      title: t('transactions:heading.search'),
      subtitle: loading ? t('transactions:heading.searching') : unknown ? '' : countLabel(count, 'result'),
    }
  }
  const title = t(`transactions:heading.${titleOf(kind, savings)}`)
  const subtitle = unknown ? periodLabel : `${periodLabel} · ${countLabel(count)}`
  return { title, subtitle }
}

// Nothing logged at all yet (not just in this period): the list loaded
// empty, no search is on, and the account's first transaction is known not
// to exist (`oldest` null; undefined while unknown or unreadable). The
// first-entry empty state shows then, instead of "No expenses in this period".
export function isFirstRun({ loading, failed, count, oldest, searching = false }) {
  return !loading && !failed && !searching && count === 0 && oldest === null
}

// The Transactions page's heading line: the heading's subtitle, and a
// search's net once its rows are in ("3 results · Net −€12.00"). `net` is
// txnFilter.netBaseMinor of the rows shown, in the base currency.
export function ledgerSummary(subtitle, { searching, loading = false, count, net, baseCurrency }) {
  return searching && !loading && count > 0
    ? `${subtitle} · ${t('transactions:ledger.net', { amount: formatSigned(net, baseCurrency) })}`
    : subtitle
}
