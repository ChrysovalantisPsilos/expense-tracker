import { parseTxnType, EMPTY_FILTERS } from './txnFilter.js'
import { NO_CATEGORY } from '../../shared/lib/categoryName.js'

// The Transactions page's URL contract. Pure (no React/supabase) so it's
// unit-testable. (Breakdown drill-downs open a category's own page instead —
// see shared/lib/categoryLinks.js.)
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
