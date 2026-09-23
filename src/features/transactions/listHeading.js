// The header over a list of transactions (Home's Expenses card, a category's
// page, the Transactions page): a title naming what's listed, and a muted
// subtitle with the period and how many entries it holds — or, for a
// search, how many results. Pure, so the three screens word it the same way.

const TITLES = { expense: 'Expenses', income: 'Income' }

export const countLabel = (n, one = 'entry', many = 'entries') => `${n} ${n === 1 ? one : many}`

//   kind        'expense' | 'income' | undefined (every kind)
//   periodLabel e.g. 'This month'
//   count       entries listed (ignored while loading)
//   searching   a search/filter is on: "Search results" + "N results"
export function listHeading({ kind, periodLabel, count, loading = false, searching = false }) {
  if (searching) {
    return { title: 'Search results', subtitle: loading ? 'Searching…' : countLabel(count, 'result', 'results') }
  }
  const title = TITLES[kind] ?? 'All transactions'
  const subtitle = loading || count == null ? periodLabel : `${periodLabel} · ${countLabel(count)}`
  return { title, subtitle }
}
