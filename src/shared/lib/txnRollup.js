import { toBaseMinor } from './currency.js'

// Bucket label for a transaction row in category breakdowns: a mirrored group
// expense rolls up under its group's name; everything else uses its category
// (or 'Uncategorized'). Kept in one place because the dashboard breakdown, the
// transaction list's group tag, and the server report must all agree.
export function bucketOf(row) {
  return row.group_expense_id
    ? (row.group_expenses?.groups?.name ?? 'Group')
    : (row.categories?.name ?? 'Uncategorized')
}

// Just the group label for a row (used where only shared rows are shown).
export function groupLabel(row) {
  return row.group_expenses?.groups?.name ?? 'Group'
}

// Sum rows into a Map keyed by keyFn(row), converting each amount to the base
// currency first. Rows whose key is null/undefined are skipped. Shared by the
// dashboard category breakdown and the budgets spend-per-category math so they
// convert and accumulate identically.
export function sumToBaseByKey(rows, baseCurrency, keyFn) {
  const m = new Map()
  for (const r of rows) {
    const key = keyFn(r)
    if (key == null) continue
    const base = toBaseMinor(r.amount_minor, r.exchange_rate, r.currency, baseCurrency)
    m.set(key, (m.get(key) ?? 0) + base)
  }
  return m
}
