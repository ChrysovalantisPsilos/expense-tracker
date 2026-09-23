import { parseTxnType, EMPTY_FILTERS, NO_CATEGORY } from './txnFilter.js'
import { bucketOf } from '../../shared/lib/txnRollup.js'

// The Transactions page's URL contract, and the drill-down links other pages
// build against it. Pure (no React/supabase) so it's unit-testable.
//
//   /transactions?type=expense&category=<id|none>&from=YYYY-MM-DD&to=YYYY-MM-DD
//
// `type` and `q` (search text) as before, plus every advanced filter, so a
// filtered ledger survives refresh, back/forward and shared links.
// `category=none` is NO_CATEGORY (see txnFilter.js).

// Filter key → URL param name.
const PARAM = { categoryId: 'category', from: 'from', to: 'to', min: 'min', max: 'max' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isIsoDate = (v) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const [y, m, d] = v.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
}
// MoneyInput's raw output: digits with at most one dot ("12", "12.", "12.5").
const isAmount = (v) => /^\d*\.?\d*$/.test(v) && v !== '.'

// Hand-edited or stale URLs never reach the query: a malformed value is dropped
// (an invalid date would make the server reject the whole request).
const VALID = {
  categoryId: (v) => v === NO_CATEGORY || UUID.test(v),
  from: isIsoDate, to: isIsoDate, min: isAmount, max: isAmount,
}

// URLSearchParams → { type, text, filters } (filters shaped like EMPTY_FILTERS).
export function parseLedgerParams(params) {
  const filters = { ...EMPTY_FILTERS }
  for (const [key, name] of Object.entries(PARAM)) {
    const v = (params.get(name) ?? '').trim()
    if (v && VALID[key](v)) filters[key] = v
  }
  return { type: parseTxnType(params.get('type')), text: params.get('q') ?? '', filters }
}

// A copy of `params` with `changes` applied — { type?, text?, categoryId?,
// from?, to?, min?, max? }; an empty value removes its param. Keys not named
// are kept as they were.
export function withLedgerParams(params, changes) {
  const next = new URLSearchParams(params)
  for (const [key, value] of Object.entries(changes)) {
    const name = key === 'type' ? 'type' : key === 'text' ? 'q' : PARAM[key]
    if (!name) continue
    if (value) next.set(name, value); else next.delete(name)
  }
  return next
}

// "This month" → "this month", "All time" → "all time"; a named month or
// year ("September 2026", "2025") stays as is.
const periodPhrase = (label) => (/^(This|All) /.test(label) ? label.toLowerCase() : label)

// A link to one category's expenses (`categoryId` may be NO_CATEGORY) in a
// period { from, to, label } (from/to null = all time) → { to, label }, where
// `label` is the accessible name ("Show Groceries expenses for this month").
export function categoryLink(name, categoryId, { from, to, label }) {
  const params = withLedgerParams(new URLSearchParams(),
    { type: 'expense', categoryId, from: from ?? '', to: to ?? '' })
  return {
    to: `/transactions?${params}`,
    label: `Show ${name} expenses for ${periodPhrase(label)}`,
  }
}

// Where a row's category bucket drills down to: its category's (or the
// uncategorised) expenses in the ledger, or — for a mirrored group share —
// its group's page (the ledger has no per-group filter; the group page is
// where those expenses live and can be discussed).
const targetOf = (row) => (row.group_expense_id
  ? (row.group_id ? `group:${row.group_id}` : null)
  : `category:${row.category_id ?? NO_CATEGORY}`)

// Drill-down links for a breakdown's buckets (bucketOf names): Map of bucket
// name → { to, label }. Only expense rows inside `period` count. A bucket
// whose rows point at different targets (a group and a category sharing a
// name) gets no link rather than a misleading one.
function bucketLinks(rows, period) {
  const { from, to } = period
  const targets = new Map()
  for (const r of rows) {
    if (r.kind === 'income') continue
    const day = String(r.spent_at).slice(0, 10)
    if ((from && day < from) || (to && day > to)) continue
    const name = bucketOf(r)
    const t = targetOf(r)
    if (!targets.has(name)) targets.set(name, t)
    else if (targets.get(name) !== t) targets.set(name, null)
  }
  const links = new Map()
  for (const [name, t] of targets) {
    if (!t) continue
    const [kind, id] = t.split(':')
    links.set(name, kind === 'group'
      ? { to: `/groups/${id}`, label: `Open the ${name} group` }
      : categoryLink(name, id, period))
  }
  return links
}

// A category breakdown's items (categoryBars rows, or spendingShares items —
// `nameOf` reads the bucket name) with their drill-down: `to` (in-app path)
// and `linkLabel` (its accessible name, e.g. "Show Groceries expenses for
// September 2026"), ready for ProgressRow / ShareLegend. `rows` are the
// transactions behind the breakdown, `period` is { from, to, label } as for
// categoryLink. A folded "Other" merges several buckets, so it gets no link.
export function linkBuckets(items, rows, period, nameOf = (item) => item.name) {
  const links = bucketLinks(rows, period)
  return items.map((item) => {
    const link = item.folded ? undefined : links.get(nameOf(item))
    return link ? { ...item, to: link.to, linkLabel: link.label } : item
  })
}
