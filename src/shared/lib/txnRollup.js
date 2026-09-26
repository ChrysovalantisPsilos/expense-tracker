import { toBaseMinor } from './currency.js'
import { t } from './i18n/i18n.js'
import { categoryDisplayName } from './categoryName.js'

// Bucket label for a transaction row in category breakdowns: a mirrored group
// expense rolls up under its group's name; everything else uses its category
// (or Uncategorized, in the app's language). Kept in one place because the dashboard breakdown, the
// transaction list's group tag, and the server report must all agree.
export function bucketOf(row) {
  return row.group_expense_id
    ? (row.group_expenses?.groups?.name ?? t('common:bucket.group'))
    : (row.categories?.name ?? t('common:bucket.uncategorized'))
}

// Just the group label for a row (used where only shared rows are shown).
export function groupLabel(row) {
  return row.group_expenses?.groups?.name ?? t('common:bucket.group')
}

// The breakdown's leftover bucket (categoryBars folds its tail into it; a
// real "Other" category merges in: _shared/breakdown.ts). An internal name,
// shown through bucketLabel.
const OTHER_BUCKET = 'Other'

// What each bucket of a breakdown is called on screen: Map of bucketOf name
// → label, from the rows behind it. A default category shows in the app's
// language (categoryDisplayName); bucketOf keeps the stored name, so buckets
// still group and link by it.
export function bucketLabels(rows) {
  const labels = new Map()
  for (const r of rows) {
    const name = bucketOf(r)
    if (!labels.has(name)) labels.set(name, r.group_expense_id || !r.categories ? name : categoryDisplayName(r.categories))
  }
  return labels
}

// One breakdown item's label: a folded "Other" (several buckets) is the
// translated leftover; anything else is its bucket's label.
export function bucketLabel(item, labels) {
  if (item.folded && item.name === OTHER_BUCKET) return t('common:bucket.other')
  return labels.get(item.name) ?? (item.name === OTHER_BUCKET ? t('common:bucket.other') : item.name)
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
