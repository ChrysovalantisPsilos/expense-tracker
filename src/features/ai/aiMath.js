// The AI helpers' pure rules on the device (unit-tested in test/aiMath.test.js):
// what "Type it" puts in the form and how Undo takes it back, which import
// merchants are asked about and how the answers land, and which state the
// month summary card is in. Returns data and translation keys, never text.
import { MERCHANTS_MAX } from '../../../supabase/functions/_shared/aiHelper.ts'
import { minorToInput } from '../../shared/lib/currency.js'
import { categoryDisplayName } from '../../shared/lib/categoryName.js'
import { monthName } from '../../shared/lib/dates.js'
import { t } from '../../shared/lib/i18n/i18n.js'

// The four helpers: the profile switch (0103, 0105) behind each.
export const AI_SWITCHES = {
  quickEntry: 'ai_quick_entry',
  importCategories: 'ai_import_categories',
  monthSummary: 'ai_month_summary',
  planWhatIf: 'ai_plan_whatif',
}

// The switches in Settings › AI helpers' order (ai:settings.<id>), and the
// profile update that turns one on or off.
export const aiSwitchIds = () => Object.keys(AI_SWITCHES)
export const aiSwitchPatch = (id, on) => ({ [AI_SWITCHES[id]]: on })

// Which helpers are on: each by its own switch (the shared demo login too,
// 0106), all off until the profile is known.
export function helpersOn(profile) {
  return Object.fromEntries(Object.entries(AI_SWITCHES)
    .map(([id, column]) => [id, profile?.[column] === true]))
}

// The first of the month of a local date 'YYYY-MM-DD'.
export const monthStartOf = (iso) => `${iso.slice(0, 7)}-01`

// A category id → the name the app shows for it (categoryDisplayName),
// sent so a default category is named in the app's language; the server
// only uses the ones that are the caller's own.
export function categoryLabels(categories, displayName = categoryDisplayName) {
  return Object.fromEntries((categories ?? []).map((c) => [c.id, displayName(c)]))
}

// ---------------------------------------------------------------------------
// Type it
// ---------------------------------------------------------------------------
// The server's entry → what the form sets, and which fields get the
// "Suggested" mark. The amount is shown the way the form's own field shows it
// (minor units → "3.60", "1800" for yen); a field the server left empty keeps
// what the form had. "Paid from" (expenses only) is marked when it's anything
// but the bank, or changed what the form had: the bank the line didn't
// mention is no suggestion worth pointing at.
export function fillPlan(entry, current) {
  const next = {
    kind: entry.kind,
    currency: entry.currency,
    amount: minorToInput(entry.amount_minor, entry.currency),
    spentAt: entry.date ?? current.spentAt,
    categoryId: entry.category_id ?? (entry.kind === current.kind ? current.categoryId : ''),
    description: entry.description ?? current.description,
    paidFrom: entry.paid_from ?? current.paidFrom,
  }
  const marked = ['amount']
  if (entry.date) marked.push('date')
  if (entry.category_id) marked.push('category')
  if (entry.description) marked.push('description')
  if (entry.paid_from && (entry.paid_from !== 'bank' || entry.paid_from !== current.paidFrom)) marked.push('paidFrom')
  return { next, marked }
}

// A category to pick once the list of that kind is on screen (switching Expense
// ↔ Income loads the other kind's categories): picked when it's there; given up
// once a list of that kind has loaded without it.
export function settlePendingCategory(pending, categories, loading) {
  if (!pending) return { pick: null, done: true }
  if (!pending.id) return { pick: '', done: true }
  if ((categories ?? []).some((c) => c.id === pending.id)) return { pick: pending.id, done: true }
  const listIsOfKind = (categories ?? []).length > 0 && categories.every((c) => c.kind === pending.kind)
  return !loading && listIsOfKind ? { pick: null, done: true } : { pick: null, done: false }
}

// ---------------------------------------------------------------------------
// Category ideas on import
// ---------------------------------------------------------------------------
// The new merchants to ask about (most rows first, as the list shows them,
// up to the server's limit): only the name and whether money went in or out.
export function suggestionRequest(groups) {
  const asked = (groups ?? []).slice(0, MERCHANTS_MAX)
  return { ids: asked.map((g) => g.id), merchants: asked.map((g) => ({ merchant: g.pattern, kind: g.kind })) }
}

// The answers ([{ index, category_id }] into `ids`) → the suggestions by group
// id, and the choices with them filled in wherever the user hasn't picked yet.
export function applySuggestions(assign, ids, suggestions) {
  const suggested = {}
  for (const s of suggestions ?? []) {
    const id = ids[s?.index]
    if (id && s.category_id) suggested[id] = s.category_id
  }
  const next = { ...assign }
  for (const [id, cat] of Object.entries(suggested)) if (!next[id]) next[id] = cat
  return { assign: next, suggested }
}

// Whether a merchant's choice is (still) the suggestion.
export const isSuggested = (suggested, assign, id) => !!suggested[id] && assign[id] === suggested[id]

// ---------------------------------------------------------------------------
// Month in plain words
// ---------------------------------------------------------------------------
// The card's state from what my_month_summary answered (`data`: undefined
// while loading, null when the helper is off) and the writing in progress:
//   hidden   nothing to show (off, not loaded, unreadable, nothing spent yet)
//   writing  a summary is being written (the first one, or an Update)
//   failed   writing the first one didn't work (Try again)
//   ready    the summary, up to date
//   stale    the summary, but the totals (or the app's language) changed since
export function summaryState({ data, error, writing, writeFailed, lang }) {
  if (!data || error) return 'hidden'
  if (writing) return 'writing'
  if (!data.summary) {
    if (data.empty) return 'hidden'
    return writeFailed ? 'failed' : 'writing'
  }
  return data.stale || data.summary.lang !== lang ? 'stale' : 'ready'
}

// Home's overview: whether it offers the Numbers | In words switch, and
// whether it shows the words. Only on This month (the summary is this
// month's), and only while there is something to show: a summary, one being
// written, or one to retry. 'hidden' (helper off, nothing spent yet) leaves
// the plain overview. `tab` is the viewer's saved choice.
export function overviewWords({ state, thisMonth, tab }) {
  const offered = thisMonth && state !== 'hidden'
  return { offered, words: offered && tab === 'words' }
}

// The words' header: "September in short" for the summary's month ('YYYY-MM-01').
export function summaryTitle(month) {
  const [y, m] = month.split('-').map(Number)
  return t('ai:summary.title', { month: monthName(new Date(y, m - 1, 1)) })
}

// Write the month's first summary without being asked: once per month and
// page visit, when there is spending and nothing written yet.
export const shouldAutoWrite = ({ data, attempted }) =>
  !!data && !data.empty && !data.summary && !attempted

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------
const ERROR_KEYS = {
  not_configured: 'notConfigured', busy: 'busy', rate_limited: 'rateLimited', off: 'off', unreadable: 'unreadable',
}
// The ai-helper error code → its message key (ai:errors.*). A helper with its
// own "couldn't tell" words passes their key as `unreadable`.
export const aiErrorKey = (code, unreadable = null) =>
  (code === 'unreadable' && unreadable ? unreadable : `ai:errors.${ERROR_KEYS[code] ?? 'failed'}`)
