// The header over a list of transactions (Home's Expenses card, a category's
// page, the Transactions page): a title naming what's listed, and a muted
// subtitle with the period and how many entries it holds — or, for a
// search, how many results. Pure, so the three screens word it the same way.

const TITLES = { expense: 'Expenses', income: 'Income' }

export const countLabel = (n, one = 'entry', many = 'entries') => `${n} ${n === 1 ? one : many}`

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
    return { title: 'Search results', subtitle: loading ? 'Searching…' : unknown ? '' : countLabel(count, 'result', 'results') }
  }
  const title = savings && kind === 'income' ? 'Savings' : TITLES[kind] ?? 'All transactions'
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
