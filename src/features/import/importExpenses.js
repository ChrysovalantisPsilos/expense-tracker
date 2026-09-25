// Import personal transactions from a bank statement (CSV / Excel). Parsing +
// normalisation live here; the page just drives the wizard. The layout is
// auto-detected (known bank presets, else header words + content) and the
// user confirms/overrides the mapping before importing.
import { supabase } from '../../shared/lib/supabase.js'
import { rateOnOrBefore } from '../../shared/lib/currency.js'
import { getRateSeriesMap } from '../../shared/lib/fx.js'
import { importFileProblem, rowsToObjects } from './sheetParse.js'
import { detectMapping, headerSignature, savedMappingFor } from './statementDetect.js'
// Pure helpers (parsing, drafts, deterministic identity) live in
// importMath.js so they're unit-testable.
import { deterministicUuid, rowToDraft, signedConvention } from './importMath.js'
import { UserError, dbError } from '../../shared/lib/errors.js'
import { STORAGE_KEYS } from '../../shared/lib/keys.js'

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
    localStorage.setItem(MAPPINGS_KEY, JSON.stringify(Object.fromEntries([...kept, [sig, mapping]])))
  } catch { /* storage full/blocked: just not remembered */ }
}

// Parse the first sheet into { headers, rows (keyed by header), headerRow,
// detection }. The file is size-checked first, then parsed in a Web Worker
// (SheetJS is loaded only there, so it isn't in the main bundle and a heavy
// file can't freeze the page). A mapping the user confirmed before for the
// same header layout wins over detection. Errors come back as clear,
// actionable messages.
export async function parseWorkbook(file) {
  const problem = importFileProblem(file)
  if (problem) throw new UserError(problem)
  const buf = await file.arrayBuffer()
  const worker = new Worker(new URL('./sheetWorker.js', import.meta.url), { type: 'module' })
  try {
    const res = await new Promise((resolve, reject) => {
      worker.onmessage = (e) => resolve(e.data)
      worker.onerror = () => reject(new UserError('The spreadsheet reader failed to start. Reload the page and try again.'))
      worker.postMessage(buf, [buf])
    })
    if (!res.ok) throw new UserError(res.message)
    const rows = rowsToObjects(res.headers, res.rows)
    const detected = detectMapping(res.headers, rows)
    const saved = savedMappingFor(rememberedMappings(), res.headers)
    // A mapping remembered before the holder field existed still gets the
    // detected one, so own-account transfers are recognised.
    const detection = saved
      ? { ...detected, mapping: { holder: detected.mapping.holder, ...saved }, confidence: 1, remembered: true }
      : detected
    return { headers: res.headers, rows, headerRow: res.headerRow, detection }
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
// `firstRow` is the file line number of rows[0], for messages. `merchants`
// maps each valid row's client_uuid to its merchant key (see rowMerchant).
//
// Bank-statement conventions handled automatically:
// - Sign: a debit/credit marker column or Debit/Credit columns decide the
//   kind; otherwise, when both signs are present, negative rows are expenses
//   and positive rows income (the near-universal export format).
// - Rules: uncategorized rows are matched against the user's saved
//   "contains → category" rules (longest pattern wins).
// - Currency: each foreign row is converted at the ECB rate for ITS date (one
//   range request per currency). Where no rate exists (offline, pre-1999, API
//   down) `manualRates[currency]` fills in; without one the row is listed in
//   `missingRates` ([{ currency, count }]) and the caller must ask the user —
//   a foreign amount is never booked at 1:1.
export async function buildTransactions({
  rows, mapping, userId, baseCurrency, categories, rules = [], manualRates = {}, firstRow = 2,
}) {
  const catByName = new Map((categories || []).map((c) => [c.name.toLowerCase(), c.id]))
  const sortedRules = [...rules].sort((a, b) => b.pattern.length - a.pattern.length)
  const ruleFor = (desc) => {
    if (!desc) return null
    const upper = desc.toUpperCase()
    return sortedRules.find((r) => upper.includes(r.pattern.toUpperCase()))?.category_id ?? null
  }

  const signed = signedConvention(rows, mapping)
  const drafts = rows.map((r) => rowToDraft(r, mapping, baseCurrency, { signed }))
  const seriesByCurrency = await fetchSeries(drafts, baseCurrency)
  const missing = new Map() // currency -> rows without a rate

  const valid = []
  const merchants = new Map() // client_uuid -> merchant key ('' = none)
  const errors = []
  const skipped = []
  const seen = new Map() // identity key -> occurrence count
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const draft = drafts[i]
    if (draft.skip) { skipped.push({ row: i + firstRow, reason: draft.skip }); continue }
    if (draft.error) { errors.push({ row: i + firstRow, reason: draft.error }); continue }
    const { spent_at, kind, currency, amount_minor, description } = draft

    const exchange_rate = currency === baseCurrency ? 1
      : rateOnOrBefore(seriesByCurrency.get(currency) ?? [], spent_at)?.rate ?? manualRates[currency] ?? null
    if (!exchange_rate) { missing.set(currency, (missing.get(currency) ?? 0) + 1); continue }

    const catName = mapping.category ? String(r[mapping.category] ?? '').toLowerCase().trim() : ''
    const category_id = (catName ? (catByName.get(catName) ?? null) : null) ?? ruleFor(description)

    const key = `${spent_at}|${amount_minor}|${currency}|${kind}|${description ?? ''}`
    const occurrence = seen.get(key) ?? 0
    seen.set(key, occurrence + 1)
    const client_uuid = await deterministicUuid(['import', userId, key, occurrence])

    merchants.set(client_uuid, draft.merchant)
    valid.push({
      user_id: userId,
      kind,
      category_id,
      amount_minor,
      currency,
      exchange_rate,
      description,
      spent_at,
      client_uuid,
    })
  }
  const missingRates = [...missing].map(([currency, count]) => ({ currency, count }))
  return { valid, merchants, errors, skipped, missingRates }
}

// One ECB series per foreign currency, spanning that currency's row dates.
function fetchSeries(drafts, baseCurrency) {
  const spans = new Map() // currency -> { first, last }
  for (const d of drafts) {
    if (d.error || d.skip || d.currency === baseCurrency) continue
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
// server's 300-calls-an-hour limit (150,000 rows).
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
