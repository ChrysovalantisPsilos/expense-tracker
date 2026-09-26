// Settings › Import rules, pure (no React/supabase — unit-tested). A rule is
// "descriptions containing `pattern` → category" (category_rules, 0040),
// saved from the import wizard's "New merchants" step and applied, longest
// pattern first, to the rows of every later import (ruleCategory in
// importMath). It has no direction of its own: its category's kind decides
// which rows it can file (money out → expense categories, money in → income).
import { foldText } from '../../shared/lib/localeParse.js'
import { isoDate } from '../../shared/lib/dates.js'
import { t } from '../../shared/lib/i18n/i18n.js'
import { byDisplayName, categoryDisplayName } from '../../shared/lib/categoryName.js'

// The server's bounds on a pattern (category_rules' CHECK, 0040).
export const PATTERN_MIN = 2
export const PATTERN_MAX = 80

// The list's filter: every rule, or those for money out / money in (each
// with its label's key, import:rules.filters.*).
export const RULE_FILTERS = [['all', 'rules.filters.all'], ['expense', 'rules.filters.expense'], ['income', 'rules.filters.income']]

// A rule's direction as the list says it.
export const directionLabel = (kind) => t(kind === 'income' ? 'import:rules.filters.income' : 'import:rules.filters.expense')

// A typed pattern as it's saved: whitespace collapsed and trimmed (the server
// does the same, 0093).
export const cleanPattern = (text) => String(text ?? '').replace(/\s+/g, ' ').trim()

// Why a typed pattern can't be saved, or null: too short, too long, or the
// same text (ignoring case and accents, as matching does) as another rule.
export function patternProblem(text, rules, id = null) {
  const pattern = cleanPattern(text)
  if (pattern.length < PATTERN_MIN) return t('import:rules.errors.short', { count: PATTERN_MIN })
  if (pattern.length > PATTERN_MAX) return t('import:rules.errors.long', { count: PATTERN_MAX })
  const key = foldText(pattern)
  if (rules.some((r) => r.id !== id && foldText(r.pattern) === key)) {
    return t('import:rules.errors.taken')
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
      || foldText(r.category?.name).includes(q)
      || foldText(categoryDisplayName(r.category)).includes(q)))
}

// The categories a rule can be moved to: the active ones, grouped by
// direction (money out first), plus the rule's current one if archived, so
// the picker still shows it.
export function ruleTargets(categories, current = null) {
  const usable = (categories ?? []).filter((c) => !c.is_archived || c.id === current)
  return [
    { kind: 'expense', label: directionLabel('expense'), categories: usable.filter((c) => c.kind === 'expense').sort(byDisplayName) },
    { kind: 'income', label: directionLabel('income'), categories: usable.filter((c) => c.kind === 'income').sort(byDisplayName) },
  ].filter((g) => g.categories.length > 0)
}
