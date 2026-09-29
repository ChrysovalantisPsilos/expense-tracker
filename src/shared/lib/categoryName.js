import { t } from './i18n/i18n.js'

// A category's name as the app shows it. A default category the user hasn't
// renamed carries a `default_key` (0094: set by the seed, cleared by the
// server on rename) and shows in the app's language
// (common:defaultCategories.<key>); any other category shows the name the
// user gave it. Display only: logic that matches categories by name (import
// rules, the "New" tag, duplicate checks, breakdown buckets) keeps using the
// stored `name`. `category` is a categories row or a read's embedded
// { name, default_key }; null/undefined gives ''.
export function categoryDisplayName(category) {
  if (!category) return ''
  const key = category.default_key
  if (key) {
    const full = `common:defaultCategories.${key}`
    const name = t(full)
    if (name !== full) return name // an unknown key falls back to the stored name
  }
  return category.name ?? ''
}

// Orders categories A–Z by the name shown (locale-aware, case-insensitive),
// for lists and pickers: the server orders by the stored name, which in
// Greek would put translated defaults in English order.
export function byDisplayName(a, b) {
  return categoryDisplayName(a).localeCompare(categoryDisplayName(b), undefined, { sensitivity: 'base' })
}

// `categoryId` value for personal expenses with no category — the breakdowns'
// "Uncategorized" bucket (a group share buckets under its group instead). The
// server can't filter on "no category", so the client refines it.
export const NO_CATEGORY = 'none'

// A new entry's category from a link (`/transactions/new?kind=…&category=…`,
// e.g. Savings' "Add to savings"): the id when it's one of the user's active
// categories of that kind, else '' (none picked) — a stale, foreign or
// mistyped id is ignored rather than trusted.
export function presetCategoryId(id, categories, kind) {
  if (!id) return ''
  const match = (categories ?? []).find((c) => c.id === id)
  return match && match.kind === kind && !match.is_archived ? match.id : ''
}

// What an entry (a transaction or a recurring rule) is called in a list or a
// dialog: its description, else its category's name, else `fallback`.
export function entryName(row, fallback) {
  return row?.description || categoryDisplayName(row?.categories) || fallback
}
