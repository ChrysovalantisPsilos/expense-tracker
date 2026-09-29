// Import personal transactions from a bank statement (CSV / Excel). Parsing +
// normalisation live here; the page just drives the wizard. The layout is
// auto-detected (known bank presets, else header words + content) and the
// user confirms/overrides the mapping before importing.
import { supabase } from '../../shared/lib/supabase.js'
import { rateOnOrBefore } from '../../shared/lib/currency.js'
import { getRateSeriesMap } from '../../shared/lib/fx.js'
import { importFileProblem, rowsToObjects } from './sheetParse.js'
import { detectMapping, headerSignature, savedMappingFor } from './statementDetect.js'
import { displayDescription } from './kbcLabels.js'
// Pure helpers (parsing, drafts, deterministic identity) live in
// importMath.js so they're unit-testable.
import {
  cleanHolderName, deterministicUuid, dropKnownRows, groupMerchants, ruleCategory, rowToDraft, signedConvention,
} from './importMath.js'
import { UserError, dbError } from '../../shared/lib/errors.js'
import { listTransactions } from '../transactions/useData.js'
import { STORAGE_KEYS } from '../../shared/lib/keys.js'
import { intlLocale, t } from '../../shared/lib/i18n/i18n.js'

// Mappings the user confirmed, per header layout — a per-device convenience
// (the next export from the same bank skips the mapping step). Browser
// storage may be unavailable (private mode, blocked): then nothing is
// remembered and detection runs as usual.
const MAPPINGS_KEY = STORAGE_KEYS.importMappings
const MAX_REMEMBERED = 20

function rememberedMappings() {
  try {
    const all = JSON.parse(localStorage.getItem(MAPPINGS_KEY) ?? '{}')
    return all && typeof all === 'object' && !Array.isArray(all) ? all : {}
  } catch {
    return {}
  }
}

export function rememberMapping(headers, mapping) {
  try {
    const all = rememberedMappings()
    const sig = headerSignature(headers)
    delete all[sig]
    const kept = Object.entries(all).slice(-(MAX_REMEMBERED - 1))
    const columns = { ...mapping }
    delete columns.holderName // kept on its own (below), not per layout
    localStorage.setItem(MAPPINGS_KEY, JSON.stringify(Object.fromEntries([...kept, [sig, columns]])))
  } catch { /* storage full/blocked: just not remembered */ }
}

// The account holder's name as banks write it — typed on the mapping step or
// read from a file's holder column (KBC's "Name") — so a file that doesn't
// name the holder (Revolut's) still recognises transfers between their own
// accounts. Per device, like the mappings; '' when unknown or unavailable.
const HOLDER_KEY = STORAGE_KEYS.importHolder

export function rememberedHolder() {
  try {
    return cleanHolderName(localStorage.getItem(HOLDER_KEY))
  } catch {
    return ''
  }
}

export function rememberHolder(name) {
  try {
    const clean = cleanHolderName(name)
    if (clean) localStorage.setItem(HOLDER_KEY, clean)
  } catch { /* storage full/blocked: just not remembered */ }
}

// Parse the file into { headers, rows (keyed by header), lines (each row's
// file line), detection }. The file is size-checked first, then parsed in a Web Worker
// (SheetJS is loaded only there, so it isn't in the main bundle and a heavy
// file can't freeze the page). A mapping the user confirmed before for the
// same header layout wins over detection. Errors come back as clear,
// actionable messages, in the app's language.
export async function parseWorkbook(file) {
  const problem = importFileProblem(file, { tr: (key, vars) => t(`import:${key}`, vars), locale: intlLocale('en-US') })
  if (problem) throw new UserError(problem)
  const buf = await file.arrayBuffer()
  const worker = new Worker(new URL('./sheetWorker.js', import.meta.url), { type: 'module' })
  try {
    const res = await new Promise((resolve, reject) => {
      worker.onmessage = (e) => resolve(e.data)
      worker.onerror = () => reject(new UserError(t('import:errors.readerFailed')))
      worker.postMessage(buf, [buf])
    })
    if (!res.ok) {
      throw new UserError(res.key
        ? t(`import:${res.key}`, { hint: t('import:errors.exportHint') })
        : t('import:errors.unreadableShort'))
    }
    const rows = rowsToObjects(res.headers, res.rows)
    const detected = detectMapping(res.headers, rows)
    const saved = savedMappingFor(rememberedMappings(), res.headers)
    // A mapping remembered before the holder field existed still gets the
    // detected one, so own-account transfers are recognised.
    const detection = saved
      ? { ...detected, mapping: { holder: detected.mapping.holder, ...saved }, confidence: 1, remembered: true }
      : detected
    return { headers: res.headers, rows, lines: res.lines, detection }
  } finally {
    worker.terminate()
  }
}

// The user's saved auto-categorization rules.
export async function listRules() {
  const { data, error } = await supabase.from('category_rules').select('id, pattern, category_id')
  if (error) throw dbError(error)
  return data ?? []
}

// Save "descriptions containing `pattern` → category" for future imports.
export async function saveRule(userId, pattern, categoryId) {
  const { error } = await supabase.from('category_rules')
    .upsert({ user_id: userId, pattern, category_id: categoryId }, { onConflict: 'user_id,pattern' })
  if (error) throw dbError(error)
}

// Turn raw rows + a mapping into ready-to-insert transactions, collecting
// per-row errors for anything unparseable and the lines that aren't
// transactions (pending/declined, balance lines, footers) as `skipped`.
// `lines` are the rows' file line numbers, for messages. `merchants`
// maps each uncategorized row's client_uuid to its merchant key: the file's
// merchant names grouped by groupMerchants, so the "New merchants" list and
// the rules saved from it use the same keys ('' = none).
//
// Bank-statement conventions handled automatically:
// - Sign: a debit/credit marker column or Debit/Credit columns decide the
//   kind; otherwise, when both signs are present, negative rows are expenses
//   and positive rows income (the near-universal export format).
// - Rules: uncategorized rows are matched against the user's saved
//   "contains → category" rules (longest pattern wins, same kind only).
// - Currency: each foreign row is converted at the rate the statement itself
//   gives (its base-currency column), else at the ECB rate for ITS date (one
//   range request per currency). Where no rate exists (offline, pre-1999, API
//   down) `manualRates[currency]` fills in; without one the row is listed in
//   `missingRates` ([{ currency, count }]) and the caller must ask the user —
//   a foreign amount is never booked at 1:1.
export async function buildTransactions({
  rows, mapping, userId, baseCurrency, categories, rules = [], manualRates = {}, lines = [],
}) {
  const catByName = new Map((categories || []).map((c) => [c.name.toLowerCase(), c.id]))
  const kindOf = new Map((categories || []).map((c) => [c.id, c.kind]))
  const sortedRules = [...rules].sort((a, b) => b.pattern.length - a.pattern.length)

  const signed = signedConvention(rows, mapping)
  const drafts = rows.map((r) => rowToDraft(r, mapping, baseCurrency, { signed }))
  const seriesByCurrency = await fetchSeries(drafts, baseCurrency)
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

    const catName = mapping.category ? String(r[mapping.category] ?? '').toLowerCase().trim() : ''
    const category_id = (catName ? (catByName.get(catName) ?? null) : null)
      ?? ruleCategory(sortedRules, kindOf, description, kind)

    const key = `${spent_at}|${amount_minor}|${currency}|${kind}|${description ?? ''}`
    const occurrence = seen.get(key) ?? 0
    seen.set(key, occurrence + 1)
    const client_uuid = await deterministicUuid(['import', userId, key, occurrence])

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

// One ECB series per foreign currency, spanning the dates of that currency's
// rows that don't carry the statement's own rate.
function fetchSeries(drafts, baseCurrency) {
  const spans = new Map() // currency -> { first, last }
  for (const d of drafts) {
    if (d.error || d.skip || d.rate || d.currency === baseCurrency) continue
    const s = spans.get(d.currency) ?? { first: d.spent_at, last: d.spent_at }
    spans.set(d.currency, {
      first: d.spent_at < s.first ? d.spent_at : s.first, last: d.spent_at > s.last ? d.spent_at : s.last,
    })
  }
  return getRateSeriesMap(spans, baseCurrency)
}

// Insert in chunks through the encrypting RPC, skipping rows whose
// deterministic identity (client_uuid) already exists (a re-imported file, or
// overlap with a previous export). Returns how many were actually new vs
// skipped as duplicates. `onProgress(done, total)` reports after each chunk.
// 500 rows a chunk keeps each call quick while staying far below the
// server's 300-calls-an-hour limit (150,000 rows). Statement rows never send
// savings_from_income or paid_from_savings, so imported savings are money
// received and imported expenses are paid from income (the server's
// defaults, 0084/0085): a statement can't say either. A backup restore sends
// both flags as they were backed up.
export async function importTransactions(rows, onProgress) {
  let inserted = 0
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500)
    const { data, error } = await supabase.rpc('save_transactions', {
      p_rows: chunk, p_ignore_duplicates: true,
    })
    if (error) throw dbError(error)
    inserted += Number(data ?? 0)
    onProgress?.(Math.min(i + 500, rows.length), rows.length)
  }
  return { inserted, duplicates: rows.length - inserted }
}

// Save a statement's rows, leaving out the ones the account already holds
// (dropKnownRows, against the entries in the file's date range) and then any
// the server finds by id. Returns { inserted, duplicates }.
export async function importNewTransactions(rows, onProgress) {
  if (!rows.length) return { inserted: 0, duplicates: 0 }
  const dates = rows.map((r) => r.spent_at).sort()
  const existing = await listTransactions({ from: dates[0], to: dates[dates.length - 1] })
  const { rows: fresh, known } = dropKnownRows(rows, existing)
  const res = await importTransactions(fresh, onProgress)
  return { inserted: res.inserted, duplicates: res.duplicates + known }
}
