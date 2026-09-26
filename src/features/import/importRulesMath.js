// Settings › Import rules, pure (no React/supabase — unit-tested). A rule is
// "descriptions containing `pattern` → category" (category_rules, 0040),
// saved from the import wizard's "New merchants" step and applied, longest
// pattern first, to the rows of every later import (ruleCategory in
// importMath). It has no direction of its own: its category's kind decides
// which rows it can file (money out → expense categories, money in → income).
import { foldText } from '../../shared/lib/localeParse.js'
import { isoDate } from '../../shared/lib/dates.js'

// The server's bounds on a pattern (category_rules' CHECK, 0040).
export const PATTERN_MIN = 2
export const PATTERN_MAX = 80

// The list's filter: every rule, or those for money out / money in.
export const RULE_FILTERS = [['all', 'All'], ['expense', 'Money out'], ['income', 'Money in']]

// A rule's direction as the list says it.
export const directionLabel = (kind) => (kind === 'income' ? 'Money in' : 'Money out')

// A typed pattern as it's saved: whitespace collapsed and trimmed (the server
// does the same, 0093).
export const cleanPattern = (text) => String(text ?? '').replace(/\s+/g, ' ').trim()

// Why a typed pattern can't be saved, or null: too short, too long, or the
// same text (ignoring case and accents, as matching does) as another rule.
export function patternProblem(text, rules, id = null) {
  const pattern = cleanPattern(text)
  if (pattern.length < PATTERN_MIN) return `Use at least ${PATTERN_MIN} characters.`
  if (pattern.length > PATTERN_MAX) return `Use at most ${PATTERN_MAX} characters.`
  const key = foldText(pattern)
  if (rules.some((r) => r.id !== id && foldText(r.pattern) === key)) {
    return 'You already have a rule for that text.'
  }
  return null
}

// The rules as the list shows them: each with its category (null when it's
// gone), its direction (the category's kind) and the local day it was added,
// sorted by pattern (case- and accent-blind).
export function ruleRows(rules, categories) {
  const byId = new Map((categories ?? []).map((c) => [c.id, c]))
  return (rules ?? []).map((r) => {
    const category = byId.get(r.category_id) ?? null
    return { ...r, category, kind: category?.kind ?? null, addedOn: r.created_at ? isoDate(new Date(r.created_at)) : null }
  }).sort((a, b) => foldText(a.pattern).localeCompare(foldText(b.pattern), 'en', { sensitivity: 'base' }))
}

// The rows matching the search `query` (in the pattern or the category's
// name, case- and accent-blind) and the direction `filter` ('all' |
// 'expense' | 'income').
export function filterRules(rows, { query = '', filter = 'all' } = {}) {
  const q = foldText(query.trim())
  return rows.filter((r) => (filter === 'all' || r.kind === filter)
    && (!q || foldText(r.pattern).includes(q)
      || foldText(r.category?.name).includes(q)))
}

// The categories a rule can be moved to: the active ones, grouped by
// direction (money out first), plus the rule's current one if archived, so
// the picker still shows it.
export function ruleTargets(categories, current = null) {
  const usable = (categories ?? []).filter((c) => !c.is_archived || c.id === current)
  const byName = (a, b) => a.name.localeCompare(b.name)
  return [
    { kind: 'expense', label: directionLabel('expense'), categories: usable.filter((c) => c.kind === 'expense').sort(byName) },
    { kind: 'income', label: directionLabel('income'), categories: usable.filter((c) => c.kind === 'income').sort(byName) },
  ].filter((g) => g.categories.length > 0)
}
