// Import personal transactions from an Excel/CSV file. Parsing + normalisation
// live here; the page just drives the wizard. Columns are auto-detected and the
// user confirms/overrides the mapping before importing.
import { supabase } from '../../shared/lib/supabase.js'
import { rateOnOrBefore } from '../../shared/lib/currency.js'
import { getRateSeries } from '../../shared/lib/fx.js'
import { importFileProblem, rowsToObjects } from './sheetParse.js'

export const IMPORT_FIELDS = [
  { key: 'date', label: 'Date', required: true },
  { key: 'amount', label: 'Amount', required: true },
  { key: 'description', label: 'Description', required: false },
  { key: 'category', label: 'Category', required: false },
  { key: 'currency', label: 'Currency', required: false },
  { key: 'type', label: 'Type (income/expense)', required: false },
]

const GUESS = {
  date: ['date', 'spent', 'when', 'day', 'posted'],
  amount: ['amount', 'value', 'total', 'price', 'cost', 'debit', 'sum'],
  currency: ['currency', 'ccy', 'cur'],
  category: ['category', 'cat', 'tag'],
  description: ['description', 'desc', 'memo', 'note', 'details', 'payee', 'merchant', 'name'],
  type: ['type', 'kind', 'direction'],
}

// Parse the first sheet into { headers, rows } (rows keyed by header). The
// file is size-checked first, then parsed by SheetJS in a Web Worker (loaded
// only now, so it isn't in the main bundle and a heavy file can't freeze the
// page). Errors come back as clear, actionable messages.
export async function parseWorkbook(file) {
  const problem = importFileProblem(file)
  if (problem) throw new Error(problem)
  const buf = await file.arrayBuffer()
  const worker = new Worker(new URL('./sheetWorker.js', import.meta.url), { type: 'module' })
  try {
    const res = await new Promise((resolve, reject) => {
      worker.onmessage = (e) => resolve(e.data)
      worker.onerror = () => reject(new Error('The spreadsheet reader failed to start. Reload the page and try again.'))
      worker.postMessage(buf, [buf])
    })
    if (!res.ok) throw new Error(res.message)
    return { headers: res.headers, rows: rowsToObjects(res.headers, res.rows) }
  } finally {
    worker.terminate()
  }
}

export function guessMapping(headers) {
  const m = {}
  const lower = (headers || []).map((h) => ({ h, l: String(h ?? '').toLowerCase().trim() }))
  for (const field of Object.keys(GUESS)) {
    const hit = lower.find(({ l }) => l && GUESS[field].some((g) => l === g || l.includes(g)))
    m[field] = hit ? hit.h : ''
  }
  return m
}

// Pure helpers (merchant keys, parsing, deterministic identity) live in
// importMath.js so they're unit-testable; merchantKey is re-exported for the
// wizard page.
import { merchantKey, deterministicUuid, parseAmount, rowToDraft } from './importMath.js'
export { merchantKey }

// The user's saved auto-categorization rules.
export async function listRules() {
  const { data, error } = await supabase.from('category_rules').select('id, pattern, category_id')
  if (error) throw new Error(error.message)
  return data ?? []
}

// Save "descriptions containing `pattern` → category" for future imports.
export async function saveRule(userId, pattern, categoryId) {
  const { error } = await supabase.from('category_rules')
    .upsert({ user_id: userId, pattern, category_id: categoryId }, { onConflict: 'user_id,pattern' })
  if (error) throw new Error(error.message)
}

// Turn raw rows + a mapping into ready-to-insert transactions, collecting
// per-row errors for anything unparseable.
//
// Bank-statement conventions handled automatically:
// - Sign: with no Type column mapped and both signs present, negative rows
//   are expenses and positive rows income (the near-universal export format).
// - Rules: uncategorized rows are matched against the user's saved
//   "contains → category" rules (longest pattern wins).
// - Currency: each foreign row is converted at the ECB rate for ITS date (one
//   range request per currency). Where no rate exists (offline, pre-1999, API
//   down) `manualRates[currency]` fills in; without one the row is listed in
//   `missingRates` ([{ currency, count }]) and the caller must ask the user —
//   a foreign amount is never booked at 1:1.
export async function buildTransactions({
  rows, mapping, userId, baseCurrency, categories, rules = [], manualRates = {},
}) {
  const catByName = new Map((categories || []).map((c) => [c.name.toLowerCase(), c.id]))
  const sortedRules = [...rules].sort((a, b) => b.pattern.length - a.pattern.length)
  const ruleFor = (desc) => {
    if (!desc) return null
    const upper = desc.toUpperCase()
    return sortedRules.find((r) => upper.includes(r.pattern.toUpperCase()))?.category_id ?? null
  }

  // Sign convention only applies when both signs exist and no Type column.
  const signed = !mapping.type && rows.some((r) => parseAmount(r[mapping.amount]) < 0)
    && rows.some((r) => parseAmount(r[mapping.amount]) > 0)

  const drafts = rows.map((r) => rowToDraft(r, mapping, baseCurrency, { signed }))
  const seriesByCurrency = await fetchSeries(drafts, baseCurrency)
  const missing = new Map() // currency -> rows without a rate

  const valid = []
  const errors = []
  const seen = new Map() // identity key -> occurrence count
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const draft = drafts[i]
    if (draft.error) { errors.push({ row: i + 2, reason: draft.error }); continue }
    const { spent_at, kind, currency, amount_minor, description } = draft

    const exchange_rate = currency === baseCurrency ? 1
      : rateOnOrBefore(seriesByCurrency.get(currency) ?? [], spent_at)?.rate ?? manualRates[currency] ?? null
    if (!exchange_rate) { missing.set(currency, (missing.get(currency) ?? 0) + 1); continue }

    const catName = mapping.category ? String(r[mapping.category] ?? '').toLowerCase().trim() : ''
    const category_id = (catName ? (catByName.get(catName) ?? null) : null) ?? ruleFor(description)

    const key = `${spent_at}|${amount_minor}|${currency}|${kind}|${description ?? ''}`
    const occurrence = seen.get(key) ?? 0
    seen.set(key, occurrence + 1)

    valid.push({
      user_id: userId,
      kind,
      category_id,
      amount_minor,
      currency,
      exchange_rate,
      description,
      spent_at,
      client_uuid: await deterministicUuid(['import', userId, key, occurrence]),
    })
  }
  const missingRates = [...missing].map(([currency, count]) => ({ currency, count }))
  return { valid, errors, missingRates }
}

// One ECB series per foreign currency, spanning that currency's row dates.
async function fetchSeries(drafts, baseCurrency) {
  const spans = new Map() // currency -> [first, last]
  for (const d of drafts) {
    if (d.error || d.currency === baseCurrency) continue
    const [a, b] = spans.get(d.currency) ?? [d.spent_at, d.spent_at]
    spans.set(d.currency, [d.spent_at < a ? d.spent_at : a, d.spent_at > b ? d.spent_at : b])
  }
  const out = new Map()
  await Promise.all([...spans].map(async ([cur, [first, last]]) => {
    out.set(cur, await getRateSeries(cur, baseCurrency, first, last))
  }))
  return out
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
    if (error) throw new Error(error.message)
    inserted += Number(data ?? 0)
    onProgress?.(Math.min(i + 500, rows.length), rows.length)
  }
  return { inserted, duplicates: rows.length - inserted }
}
