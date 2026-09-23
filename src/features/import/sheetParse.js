// Spreadsheet parsing, independent of where it runs: the import Web Worker
// passes in SheetJS, and the unit tests do the same in node. Pure apart from
// the SheetJS calls; no DOM, no Supabase.
import { isoDate } from '../../shared/lib/dates.js'

// Statement files are small; anything bigger is almost certainly not one, and
// parsing it would freeze low-end phones.
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024

const EXPORT_HINT =
  'Re-export it as CSV (in Numbers/Excel: File → Export To → CSV) and upload that.'

// A reason the file can't be imported (before reading a byte of it), or null.
export function importFileProblem({ name = '', size = 0 }) {
  // .numbers is an Apple package format SheetJS cannot read at all.
  if (name.toLowerCase().endsWith('.numbers')) {
    return `Numbers documents can’t be imported directly. ${EXPORT_HINT}`
  }
  if (size > MAX_IMPORT_BYTES) {
    const mb = (size / 1024 / 1024).toFixed(1)
    return `That file is ${mb} MB; the limit is 5 MB. Export a shorter date range (or just the columns you need) and try again.`
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

// Parse the first sheet of `buf` into { headers, rows } where rows are arrays
// aligned with headers. Arrays (not header-keyed objects) cross the worker
// boundary, so a hostile header such as "__proto__" is never used as a key
// here. Hardened against files SheetJS chokes on — notably Apple Numbers
// exports, whose metadata can crash the default reader: retry with the extra
// parsing off, and on real failure throw a clear message.
export function parseSheet(XLSX, buf) {
  let wb
  try {
    wb = XLSX.read(buf, { type: 'array', cellDates: true })
  } catch {
    try {
      // Drop styles/HTML/number-format/VBA parsing — smaller surface, avoids
      // several export-quirk crashes.
      wb = XLSX.read(buf, {
        type: 'array', cellDates: true, cellStyles: false, cellHTML: false, cellNF: false, bookVBA: false,
      })
    } catch {
      throw new Error(`This spreadsheet couldn’t be read. ${EXPORT_HINT}`)
    }
  }

  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) return { headers: [], rows: [] }
  let aoa
  try {
    aoa = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: null })
  } catch {
    throw new Error(`This spreadsheet couldn’t be read. ${EXPORT_HINT}`)
  }
  const headers = uniqueHeaders(aoa[0] ?? [])
  const rows = aoa.slice(1).map((r) => headers.map((_, i) => cell(r[i])))
  return { headers, rows }
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
