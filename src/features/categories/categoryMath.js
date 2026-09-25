// Pure category rules (no I/O) — unit-tested in test/categoryMath.test.js.
// The name rules mirror the server's CHECK (0060): 1–60 characters after
// trimming, no control characters. Names are unique per kind; the server's
// UNIQUE is case-sensitive, the form is stricter so "food" and "Food" can't
// both exist.

import { NO_CATEGORY } from '../transactions/txnFilter.js'
import { paidInWindow, spendRows } from '../../shared/lib/spread.js'
import { toBaseMinor } from '../../shared/lib/currency.js'

export const CATEGORY_NAME_MAX = 60

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/

// Why `name` can't be saved, or null when it can. `others` are the user's
// categories of the same kind (archived included), without the one being edited.
export function categoryNameError(name, others = []) {
  const n = String(name ?? '').trim()
  if (!n) return 'Give the category a name.'
  if ([...n].length > CATEGORY_NAME_MAX) return `Keep it to ${CATEGORY_NAME_MAX} characters.`
  if (CONTROL.test(n)) return 'Use letters, numbers and punctuation only.'
  const key = n.toLocaleLowerCase()
  if (others.some((c) => String(c.name).trim().toLocaleLowerCase() === key)) {
    return 'You already have a category with that name.'
  }
  return null
}

// The categories page list for one kind: active first, then archived, each
// A–Z (locale-aware, case-insensitive).
export function sortCategories(categories, kind) {
  return (categories ?? [])
    .filter((c) => c.kind === kind)
    .sort((a, b) => Number(!!a.is_archived) - Number(!!b.is_archived)
      || String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' }))
}

// Where a deleted category's entries can go: the other active categories of
// the same kind, A–Z.
export function moveTargets(categories, deleting) {
  return sortCategories(categories, deleting?.kind)
    .filter((c) => c.id !== deleting?.id && !c.is_archived)
}

// The categories a name must not clash with when adding/editing `category`:
// the same kind's (archived included), without the one being edited.
export function sameKindOthers(categories, category) {
  return (categories ?? []).filter((c) => c.kind === category?.kind && c.id !== category?.id)
}

// The update an edit form's { name, icon, color } makes to `category`, or
// null when nothing changed (the name compares trimmed, as it's stored).
export function categoryPatch(category, { name, icon, color }) {
  const patch = {}
  if (String(name ?? '').trim() !== category.name) patch.name = name
  if ((icon ?? null) !== (category.icon ?? null)) patch.icon = icon
  if ((color ?? null) !== (category.color ?? null)) patch.color = color
  return Object.keys(patch).length ? patch : null
}

// A category's page for one period { from, to } (null = open-ended), from
// the rows my_transactions returned with `spread` (see spread.js):
//   listed — the real payments in the period, newest first as given (a
//            yearly subscription paid earlier isn't listed)
//   total  — base-currency minor units counted in the period: a spread
//            yearly subscription counts its monthly parts (or nothing when
//            `separateYearly`), and a salary paid late in the month counts
//            toward the next (`salaryShift`), exactly as the budget bars and
//            Home count it
// `categoryId` NO_CATEGORY keeps personal rows with no category (group
// shares bucket under their group instead); any other id keeps that
// category's rows.
export function categoryPeriod(rows, { categoryId, from, to, baseCurrency, separateYearly = false, salaryShift = null }) {
  const mine = (rows ?? []).filter((r) => (categoryId === NO_CATEGORY
    ? !r.category_id && !r.group_expense_id
    : r.category_id === categoryId))
  const total = spendRows(mine, baseCurrency, from, to, { separateYearly, salaryShift })
    .reduce((sum, r) => sum + toBaseMinor(r.amount_minor, r.exchange_rate, r.currency, baseCurrency), 0)
  return { listed: paidInWindow(mine, from, to), total }
}

// The default income categories added in 0081: new accounts are seeded with
// them and 0082 gave every existing account the same two. The category list
// tags them "New" for NEW_TAG_MS after they were added. The tag is UI only —
// never part of the name — so it can't reach statements or exports.
// test/categoryMath.test.js keeps this list in lockstep with the seed and the
// backfill.
export const NEW_DEFAULT_CATEGORIES = [
  { name: 'Friend Transfer', icon: 'transfer', kind: 'income' },
  { name: 'Bonus', icon: 'salary', kind: 'income' },
]
export const NEW_TAG_MS = 2 * 24 * 60 * 60 * 1000

// Does `category` still wear its "New" tag at time `now` (ms)?
export function isNewCategory(category, now = Date.now()) {
  const added = Date.parse(category?.created_at ?? '')
  if (!Number.isFinite(added)) return false
  const age = now - added
  return age >= 0 && age < NEW_TAG_MS
    && NEW_DEFAULT_CATEGORIES.some((d) => d.kind === category.kind && d.name === category.name)
}
