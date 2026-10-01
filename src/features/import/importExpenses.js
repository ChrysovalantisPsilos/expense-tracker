// Import personal transactions from a bank statement (CSV / Excel). The
// network and this device's storage live here; the page just drives the
// wizard. The layout is auto-detected (known bank presets, else header words
// + content) and the user confirms/overrides the mapping before importing.
// Every step in between is pure (statementRows.js, importMath.js,
// statementDetect.js), so the native app runs the same ones.
import { supabase } from '../../shared/lib/supabase.js'
import { getRateSeriesMap } from '../../shared/lib/fx.js'
import { rowsToObjects } from './sheetParse.js'
import { detectStatement, rememberedWith } from './statementDetect.js'
import { cleanHolderName, dropKnownRows, importedRange } from './importMath.js'
import { SAVE_CHUNK, rateSpans, statementRows } from './statementRows.js'
import { fileProblem, readProblem } from './importText.js'
import { UserError, dbError } from '../../shared/lib/errors.js'
import { listTransactions } from '../../shared/lib/transactions.js'
import { STORAGE_KEYS } from '../../shared/lib/keys.js'
import { t } from '../../shared/lib/i18n/i18n.js'

// Mappings the user confirmed, per header layout — a per-device convenience
// (the next export from the same bank skips the mapping step). Browser
// storage may be unavailable (private mode, blocked): then nothing is
// remembered and detection runs as usual.
const MAPPINGS_KEY = STORAGE_KEYS.importMappings

function rememberedMappings() {
  try {
    return JSON.parse(localStorage.getItem(MAPPINGS_KEY) ?? '{}')
  } catch {
    return {}
  }
}

export function rememberMapping(headers, mapping) {
  try {
    localStorage.setItem(MAPPINGS_KEY, JSON.stringify(rememberedWith(rememberedMappings(), headers, mapping)))
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
  const problem = fileProblem(file)
  if (problem) throw new UserError(problem)
  const buf = await file.arrayBuffer()
  const worker = new Worker(new URL('./sheetWorker.js', import.meta.url), { type: 'module' })
  try {
    const res = await new Promise((resolve, reject) => {
      worker.onmessage = (e) => resolve(e.data)
      worker.onerror = () => reject(new UserError(t('import:errors.readerFailed')))
      worker.postMessage(buf, [buf])
    })
    if (!res.ok) throw new UserError(readProblem(res.key))
    const rows = rowsToObjects(res.headers, res.rows)
    return { headers: res.headers, rows, lines: res.lines, detection: detectStatement(res.headers, rows, rememberedMappings()) }
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

// Raw rows + a mapping → { valid, merchants, errors, skipped, missingRates }
// (statementRows.statementRows), after fetching the ECB series the foreign
// rows need: one range request per currency.
export async function buildTransactions({
  rows, mapping, userId, baseCurrency, categories, rules = [], manualRates = {}, lines = [],
}) {
  const seriesByCurrency = await getRateSeriesMap(rateSpans(rows, mapping, baseCurrency), baseCurrency)
  return statementRows({ rows, mapping, userId, baseCurrency, categories, rules, manualRates, lines, seriesByCurrency })
}

// Insert in chunks through the encrypting RPC, skipping rows whose
// deterministic identity (client_uuid) already exists (a re-imported file, or
// overlap with a previous export). Returns how many were actually new vs
// skipped as duplicates. `onProgress(done, total)` reports after each chunk.
// Statement rows never send
// savings_from_income or paid_from_savings, so imported savings are money
// received and imported expenses are paid from income (the server's
// defaults, 0084/0085): a statement can't say either. A backup restore sends
// both flags as they were backed up.
export async function importTransactions(rows, onProgress) {
  let inserted = 0
  for (let i = 0; i < rows.length; i += SAVE_CHUNK) {
    const chunk = rows.slice(i, i + SAVE_CHUNK)
    const { data, error } = await supabase.rpc('save_transactions', {
      p_rows: chunk, p_ignore_duplicates: true,
    })
    if (error) throw dbError(error)
    inserted += Number(data ?? 0)
    onProgress?.(Math.min(i + SAVE_CHUNK, rows.length), rows.length)
  }
  return { inserted, duplicates: rows.length - inserted }
}

// Save a statement's rows, leaving out the ones the account already holds
// (dropKnownRows, against the entries in the file's date range) and then any
// the server finds by id. Returns { inserted, duplicates }.
export async function importNewTransactions(rows, onProgress) {
  if (!rows.length) return { inserted: 0, duplicates: 0 }
  const existing = await listTransactions(importedRange(rows))
  const { rows: fresh, known } = dropKnownRows(rows, existing)
  const res = await importTransactions(fresh, onProgress)
  return { inserted: res.inserted, duplicates: res.duplicates + known }
}
