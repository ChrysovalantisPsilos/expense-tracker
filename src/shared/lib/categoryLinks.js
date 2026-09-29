import { NO_CATEGORY } from './categoryName.js'
import { periodFromValue, thisMonthPeriod } from './periods.js'
import { bucketLabels, bucketOf } from './txnRollup.js'
import { t } from './i18n/i18n.js'

// The category page's URL contract, and the drill-down links other pages
// build against it. Pure (no React/supabase) so it's unit-testable.
//
//   /categories/<id|none>?period=<m:YYYY-M | y:YYYY | all>
//
// `none` (NO_CATEGORY) is the "Uncategorized" bucket: personal entries with
// no category. No `period` means this month.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// The page for a category (optionally in a period token, see periods.js).
export function categoryPath(categoryId, periodValue) {
  const base = `/categories/${encodeURIComponent(categoryId)}`
  return periodValue ? `${base}?period=${encodeURIComponent(periodValue)}` : base
}

// The route's `:id` and search params → { categoryId, period }: categoryId is
// a UUID, NO_CATEGORY, or null for a malformed one (the page then says it
// can't be found); an unknown or missing period falls back to this month.
export function parseCategoryRoute(id, params, d = new Date()) {
  const categoryId = id === NO_CATEGORY || UUID.test(id ?? '') ? id : null
  const period = periodFromValue(params.get('period'), d) ?? thisMonthPeriod(d)
  return { categoryId, period }
}

// "This month" → "this month", "All time" → "all time"; a named month or
// year ("September 2026", "2025") stays as is. (English only: the Greek
// sentence puts the period after a "·", where it keeps its capital.)
const periodPhrase = (label) => (/^(This|All) /.test(label) ? label.toLowerCase() : label)

// A link to one category's page (`categoryId` may be NO_CATEGORY) for a
// period { value?, label } → { to, label }, where `label` is the accessible
// name ("Show Groceries expenses for this month"). A period without a value
// opens on this month.
export function categoryLink(name, categoryId, { value, label }) {
  return {
    to: categoryPath(categoryId, value),
    label: t('categories:links.show', { name, period: periodPhrase(label) }),
  }
}

// Where a row's category bucket drills down to: its category's (or the
// uncategorised) page, or — for a mirrored group share — its group's page
// (that's where those expenses live and can be discussed).
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
    const target = targetOf(r)
    if (!targets.has(name)) targets.set(name, target)
    else if (targets.get(name) !== target) targets.set(name, null)
  }
  const labels = bucketLabels(rows.filter((r) => r.kind !== 'income'))
  const links = new Map()
  for (const [name, target] of targets) {
    if (!target) continue
    const [kind, id] = target.split(':')
    links.set(name, kind === 'group'
      ? { to: `/groups/${id}`, label: t('categories:links.group', { name }) }
      : categoryLink(labels.get(name) ?? name, id, period))
  }
  return links
}

// A category breakdown's items (categoryBars rows or spendingShares items;
// `name` is the bucket) with their drill-down: `to` (in-app path)
// and `linkLabel` (its accessible name, e.g. "Show Groceries expenses for
// September 2026"), ready for ProgressRow / ShareLegend. `rows` are the
// transactions behind the breakdown, `period` is { value?, from, to, label }
// (from/to null = all time). A folded "Other" merges several buckets, so it
// gets no link.
export function linkBuckets(items, rows, period) {
  const links = bucketLinks(rows, period)
  return items.map((item) => {
    const link = item.folded ? undefined : links.get(item.name)
    return link ? { ...item, to: link.to, linkLabel: link.label } : item
  })
}
