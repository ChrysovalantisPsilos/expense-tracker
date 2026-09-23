// Pure category rules (no I/O) — unit-tested in test/categoryMath.test.js.
// The name rules mirror the server's CHECK (0060): 1–60 characters after
// trimming, no control characters. Names are unique per kind; the server's
// UNIQUE is case-sensitive, the form is stricter so "food" and "Food" can't
// both exist.

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
