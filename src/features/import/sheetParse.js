// Spreadsheet parsing, independent of where it runs: the import Web Worker
// passes in SheetJS, and the unit tests do the same in node. Pure apart from
// the SheetJS calls; no DOM, no Supabase.
import { isoDate } from '../../shared/lib/dates.js'
import { sniffContainer, decodeText, parseDelimited } from './statementText.js'
import { locateHeader } from './statementDetect.js'
import { matchPreset } from './bankPresets.js'
import { UserError } from '../../shared/lib/errors.js'
import { interpolate, lookup } from '../../shared/lib/i18n/translate.js'
import en from '../../locales/en/import.js'

// Statement files are small; anything bigger is almost certainly not one, and
// parsing it would freeze low-end phones.
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024

// Messages about the file are import:errors.* keys. This module also runs in
// the parsing worker, which loads no dictionaries (that would bundle every
// language into it), so by default it words them in English, and an error it
// throws carries its `key`: the page shows that in the user's language
// (importExpenses.parseWorkbook).
const english = (key, vars) => interpolate(lookup(en, key), vars)

function unreadable() {
  const err = new UserError(english('errors.unreadable', { hint: english('errors.exportHint') }))
  err.key = 'errors.unreadable'
  return err
}

// A reason the file can't be imported (before reading a byte of it), or null.
// `tr(key, vars)` words it (the page passes its own, in the user's language)
// and `locale` formats the size.
export function importFileProblem({ name = '', size = 0 }, { tr = english, locale = 'en-US' } = {}) {
  // .numbers is an Apple package format SheetJS cannot read at all.
  if (name.toLowerCase().endsWith('.numbers')) {
    return tr('errors.numbers', { hint: tr('errors.exportHint') })
  }
  if (size > MAX_IMPORT_BYTES) {
    const mb = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: false })
      .format(size / 1024 / 1024)
    return tr('errors.tooBig', { size: mb })
  }
  return null
}

// Unique, non-empty column names: blanks become "Column 3", repeats "Amount (2)".
export function uniqueHeaders(raw) {
  const seen = new Map()
  return raw.map((h, i) => {
    const base = String(h ?? '').trim() || `Column ${i + 1}`
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return n === 1 ? base : `${base} (${n})`
  })
}

// Cell values that are safe to structured-clone and unambiguous: dates become
// their LOCAL calendar day as YYYY-MM-DD (SheetJS builds local-midnight Dates).
const cell = (v) => (v instanceof Date ? (isNaN(v) ? null : isoDate(v)) : v ?? null)

const filled = (c) => c != null && String(c).trim() !== ''

// Parse `buf` into { headers, rows, lines }: rows are arrays aligned with
// headers, lines[i] is the file line rows[i] came from (for messages). The
// header row is found below any preamble (bank exports often start with
// account/period lines); blank rows are left out. Text files (CSV/TSV,
// whatever their extension) go through our own decoder and parser so every
// cell stays text — SheetJS would guess "03/04/2026" US-style — and
// Greek/Windows code pages decode correctly. Real workbooks (.xlsx, .xls,
// HTML-table "Excel" exports) go through SheetJS; of several sheets, the one
// with the most header-like row is read (the first on a tie). A sectioned
// report (a preset with `sections`, like Revolut's consolidated statement) is
// read as all of its transaction tables, on every sheet (see sectionRows).
// Arrays (not header-keyed objects) cross the worker boundary, so a hostile
// header such as "__proto__" is never used as a key here.
export function parseSheet(XLSX, buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  const kind = sniffContainer(bytes)
  const sheets = kind === 'text' ? [parseDelimited(decodeText(bytes).text)] : readWorkbook(XLSX, bytes, kind)
  const found = sheets.map((aoa) => ({ aoa, ...locateHeader(aoa) }))
  const { aoa, row } = found.reduce((best, s) => (s.score > best.score ? s : best))
  const raw = aoa[row] ?? []
  const { headers, rows, lines } = matchPreset(uniqueHeaders(raw))?.preset.sections
    ? sectionRows(sheets, raw)
    : plainRows(aoa, row)
  return { headers, rows: rows.map((r) => r.map(cell)), lines }
}

// The rows under the header at `row`, aligned with it.
function plainRows(aoa, row) {
  const headers = uniqueHeaders(aoa[row] ?? [])
  const rows = []
  const lines = []
  for (let i = row + 1; i < aoa.length; i++) {
    const r = aoa[i] ?? []
    if (!r.some(filled)) continue
    rows.push(headers.map((_, j) => r[j] ?? null))
    lines.push(i + 1)
  }
  return { headers, rows, lines }
}

// A row's cells up to its last filled one (CSV exports pad every line).
function trimmed(r) {
  let n = r.length
  while (n && !filled(r[n - 1])) n--
  return r.slice(0, n)
}

// The transaction tables of a sectioned report, as one table. A table starts
// under any row of the same bank layout as `header` — the repeated header, or
// a variant of it (a non-euro Revolut account doubles every money column) —
// and ends at a "Total" row or a title or separator row (one filled cell:
// "Transaction statement", "Personal Account (USD)", "---------").
// Everything else — account summaries, balances, tables with other headers
// (savings interest, investments, crypto) and blank rows — is left out. Each
// table's columns go to the union of the tables' headers, by name ("Money
// in/out", "Money in/out (2)"), so rows line up whichever variant they came
// from. Pure: `sheets` are arrays of rows.
export function sectionRows(sheets, header) {
  const id = matchPreset(uniqueHeaders(trimmed(header)))?.preset.id
  const headers = []
  const rows = []
  const lines = []
  for (const aoa of sheets) {
    let slots = null // column j of the current table → index in headers
    aoa.forEach((r0, i) => {
      const r = trimmed(r0 ?? [])
      const cells = r.filter(filled).length
      if (!cells) return
      if (cells === 1 || String(r[0] ?? '').trim().toLowerCase() === 'total') { slots = null; return }
      const names = uniqueHeaders(r)
      if (id && matchPreset(names)?.preset.id === id) {
        slots = names.map((h) => {
          if (!headers.includes(h)) headers.push(h)
          return headers.indexOf(h)
        })
        return
      }
      if (!slots) return
      const out = []
      slots.forEach((slot, j) => { out[slot] = r[j] })
      rows.push(out)
      lines.push(i + 1)
    })
  }
  return { headers, rows: rows.map((r) => headers.map((_, j) => r[j] ?? null)), lines }
}

// SheetJS, hardened against files it chokes on — notably Apple Numbers
// exports, whose metadata can crash the default reader: retry with the extra
// parsing off, and on real failure throw a clear message. Every sheet as rows,
// blank ones kept so each row's index is its line.
function readWorkbook(XLSX, bytes, kind) {
  // HTML "spreadsheets" are text: keep their cells as written.
  const base = { type: 'array', cellDates: true, raw: kind === 'html' }
  let wb
  try {
    wb = XLSX.read(bytes, base)
  } catch {
    try {
      // Drop styles/HTML/number-format/VBA parsing — smaller surface, avoids
      // several export-quirk crashes.
      wb = XLSX.read(bytes, { ...base, cellStyles: false, cellHTML: false, cellNF: false, bookVBA: false })
    } catch {
      throw unreadable()
    }
  }
  try {
    const sheets = wb.SheetNames.map((name) => wb.Sheets[name]).filter(Boolean).map((ws) => {
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: true, defval: null })
      // Rows above the sheet's used range (it can start below row 1).
      const top = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']).s.r : 0
      return [...Array(top).fill([]), ...aoa]
    })
    return sheets.length ? sheets : [[]]
  } catch {
    throw unreadable()
  }
}

// Header-keyed rows for the mapping step. Null-prototype objects: a column
// named "__proto__" or "constructor" is just a key, never the prototype.
export function rowsToObjects(headers, rows) {
  return rows.map((r) => {
    const o = Object.create(null)
    headers.forEach((h, i) => { o[h] = r[i] ?? null })
    return o
  })
}
