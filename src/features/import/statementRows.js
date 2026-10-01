// The statement import's steps from a mapped file to the rows to save, pure
// (no Supabase, no fetch — unit-tested, and run by the native app's core):
// the live preview, which exchange rates the file needs, the rows themselves
// with their ids and merchants, the review's choices, and what the import
// says when it's done. importExpenses.js adds the network around them (the
// ECB rates, the rules, the save).
import { rateOnOrBefore } from '../../shared/lib/currency.js'
import {
  categoryMatcher, deterministicUuid, groupIdOf, groupMerchants, importedRange, previewDrafts, rowToDraft, signedConvention,
} from './importMath.js'
import { displayDescription } from './kbcLabels.js'

// Rows a save sends at once: each call stays quick, and far below the
// server's 300-calls-an-hour limit (150,000 rows).
export const SAVE_CHUNK = 500

// Date and Amount (or Debit and Credit) are mapped: enough to import.
export const mappingComplete = (m) => Boolean(m?.date && (m.amount || (m.debit && m.credit)))

// Every row as a draft (importMath.rowToDraft), with the file's sign rule.
function statementDrafts(rows, mapping, baseCurrency) {
  const signed = signedConvention(rows, mapping)
  return rows.map((r) => rowToDraft(r, mapping, baseCurrency, { signed }))
}

// The live preview under the mapping step (importMath.previewDrafts), each
// shown row with the category it will get: the file's own column or a saved
// rule (`categories` of both kinds, `rules` the saved ones).
export function statementPreview(rows, mapping, baseCurrency, { categories = [], rules = [] } = {}) {
  return previewDrafts(rows, mapping, baseCurrency, { categoryOf: categoryMatcher(categories, rules) })
}

// The ECB series a file needs: currency → { first, last } over the dates of
// that currency's rows that don't carry the statement's own rate.
export function rateSpans(rows, mapping, baseCurrency) {
  const spans = new Map()
  for (const d of statementDrafts(rows, mapping, baseCurrency)) {
    if (d.error || d.skip || d.rate || d.currency === baseCurrency) continue
    const s = spans.get(d.currency) ?? { first: d.spent_at, last: d.spent_at }
    spans.set(d.currency, {
      first: d.spent_at < s.first ? d.spent_at : s.first, last: d.spent_at > s.last ? d.spent_at : s.last,
    })
  }
  return spans
}

// Raw rows + a mapping → ready-to-insert transactions, with per-row errors for
// anything unparseable and the lines that aren't transactions (pending or
// declined, balance lines, footers) as `skipped`. `lines` are the rows' file
// line numbers, for messages. `merchants` maps each uncategorized row's
// client_uuid to its merchant key: the file's merchant names grouped by
// groupMerchants, so the "New merchants" list and the rules saved from it use
// the same keys ('' = none).
//
// Bank-statement conventions handled automatically:
// - Sign: a debit/credit marker column or Debit/Credit columns decide the
//   kind; otherwise, when both signs are present, negative rows are expenses
//   and positive rows income (the near-universal export format).
// - Rules: uncategorized rows are matched against the user's saved
//   "contains → category" rules (longest pattern wins, same kind only).
// - Currency: each foreign row is converted at the rate the statement itself
//   gives (its base-currency column), else at the ECB rate for ITS date
//   (`seriesByCurrency`: currency → the series rateSpans asked for). Where no
//   rate exists (offline, pre-1999, API down) `manualRates[currency]` fills
//   in; without one the row is listed in `missingRates` ([{ currency, count }])
//   and the caller must ask the user — a foreign amount is never booked at 1:1.
// - Identity: each row's client_uuid is deterministic (user + date, amount,
//   currency, kind, text + how many identical rows came before it), so a
//   re-imported file never duplicates.
export function statementRows({
  rows, mapping, userId, baseCurrency, categories, rules = [], manualRates = {}, lines = [], seriesByCurrency = new Map(),
}) {
  const categoryOf = categoryMatcher(categories, rules)
  const drafts = statementDrafts(rows, mapping, baseCurrency)
  const missing = new Map() // currency -> rows without a rate

  const valid = []
  const names = new Map() // client_uuid -> merchant name, uncategorized rows only
  const errors = []
  const skipped = []
  const seen = new Map() // identity key -> occurrence count
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const draft = drafts[i]
    if (draft.skip) { skipped.push({ row: lines[i], reason: draft.skip }); continue }
    if (draft.error) { errors.push({ row: lines[i], reason: draft.error }); continue }
    const { spent_at, kind, currency, amount_minor, description } = draft

    const exchange_rate = currency === baseCurrency ? 1
      : draft.rate ?? rateOnOrBefore(seriesByCurrency.get(currency) ?? [], spent_at)?.rate ?? manualRates[currency] ?? null
    if (!exchange_rate) { missing.set(currency, (missing.get(currency) ?? 0) + 1); continue }

    const category_id = categoryOf(draft, r, mapping)

    const key = `${spent_at}|${amount_minor}|${currency}|${kind}|${description ?? ''}`
    const occurrence = seen.get(key) ?? 0
    seen.set(key, occurrence + 1)
    const client_uuid = deterministicUuid(['import', userId, key, occurrence])

    if (!category_id && description) names.set(client_uuid, draft.merchant)
    valid.push({
      user_id: userId,
      kind,
      category_id,
      amount_minor,
      currency,
      exchange_rate,
      // Saved shorter for KBC rows; the raw text above made the key and the rule match.
      description: displayDescription(draft),
      spent_at,
      client_uuid,
    })
  }
  const keyOf = groupMerchants([...names.values()])
  const merchants = new Map([...names].map(([uuid, name]) => [uuid, keyOf.get(name) ?? '']))
  const missingRates = [...missing].map(([currency, count]) => ({ currency, count }))
  return { valid, merchants, errors, skipped, missingRates }
}

// The review's choices (`assignments`: a group's id → a category id, blank
// for none) → the rows with those categories, and the rules to remember
// ({ pattern, category_id }, in the groups' order) for future imports.
export function applyReview(valid, merchants, groups, assignments) {
  const chosen = new Map(Object.entries(assignments ?? {}).filter(([, id]) => id))
  return {
    rules: groups.filter((g) => chosen.get(g.id)).map((g) => ({ pattern: g.pattern, category_id: chosen.get(g.id) })),
    rows: valid.map((t) => {
      if (t.category_id || !t.description) return t
      const id = chosen.get(groupIdOf(t, merchants))
      return id ? { ...t, category_id: id } : t
    }),
  }
}

// What the done step reports: the save's { inserted, duplicates } with the
// rows that couldn't be read (`errors`, the first ten kept for the example),
// the lines left out (own transfers counted apart) and the saved rows' dates.
export function importSummary({ inserted, duplicates }, { errors = [], skipped = [], rows = [] }) {
  const own = skipped.filter((s) => s.reason === 'own transfer').length
  return {
    inserted, duplicates, failed: errors.length, errors: errors.slice(0, 10),
    ownTransfers: own, ignored: skipped.length - own, range: importedRange(rows),
  }
}
