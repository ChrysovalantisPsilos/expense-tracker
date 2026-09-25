// Understanding an uploaded statement: where the header row is (below any
// bank preamble), which bank layout it is, which column feeds which field,
// how its dates and decimals are written — and how sure we are. Pure module.
import { PRESETS, matchPreset, normHeader, findHeader } from './bankPresets.js'
import { parseDate, parseAmount, normalizeCurrency, directionOf, rowToDraft, signedConvention } from './importMath.js'
import { CURRENCIES } from '../../shared/lib/currency.js'

// The fields a mapping can fill, in the order the mapping step shows them.
// Amount alone, or Debit + Credit, is required alongside Date.
export const IMPORT_FIELDS = [
  { key: 'date', label: 'Date', required: true },
  { key: 'amount', label: 'Amount (signed)', hint: 'or Debit + Credit below' },
  { key: 'debit', label: 'Debit / money out' },
  { key: 'credit', label: 'Credit / money in' },
  { key: 'type', label: 'Debit/credit marker (D/C, Af/Bij, Χ/Π, income/expense)' },
  { key: 'counterparty', label: 'Payee / counterparty' },
  { key: 'holder', label: 'Account holder (your own name)', hint: 'transfers to it aren’t merchants' },
  { key: 'description', label: 'Description' },
  { key: 'details', label: 'More details' },
  { key: 'currency', label: 'Currency' },
  { key: 'category', label: 'Category' },
  { key: 'status', label: 'Status (pending rows are skipped)' },
  { key: 'fee', label: 'Fee' },
  { key: 'baseAmount', label: 'Amount in your base currency', hint: 'the bank’s own conversion of a foreign amount' },
]

// At or above this, the detected mapping is used as-is (the user can still
// open it); below it, the mapping step is shown for confirmation.
export const CONFIDENCE_THRESHOLD = 0.8

// Generic header words per field, normalized (see normHeader), EN/FR/NL/EL/DE.
// Order matters: earlier words are better matches.
const KEYWORDS = {
  date: ['transaction date', 'booking date', 'date', 'datum', 'boekingsdatum', 'uitvoeringsdatum',
    'date operation', 'date d operation', 'date comptable', 'date d execution', 'buchungstag',
    'ημερομηνια', 'ημ νια', 'ημερομηνια συναλλαγησ', 'ημ νια συναλλαγησ', 'ημ νια κινησησ',
    'started date', 'completed date', 'posting date', 'posted', 'spent', 'when', 'day'],
  amount: ['amount', 'bedrag', 'montant', 'ποσο', 'betrag', 'importe', 'transaction amount', 'value',
    'total', 'sum', 'price', 'cost'],
  debit: ['debit', 'debet', 'χρεωση', 'withdrawal', 'withdrawals', 'paid out', 'money out', 'out', 'uitgaven', 'soll'],
  credit: ['credit', 'πιστωση', 'deposit', 'deposits', 'paid in', 'money in', 'in', 'inkomsten', 'haben'],
  type: ['af bij', 'debit credit', 'd c', 'dc', 'χ π', 'προσημο ποσου', 'προσημο', 'sens', 'direction', 'type', 'kind'],
  currency: ['currency', 'devise', 'munt', 'munteenheid', 'νομισμα', 'wahrung', 'ccy', 'cur'],
  counterparty: ['counterparty', 'name of the counterparty', 'counterparty name', 'naam tegenpartij',
    'naam van de tegenpartij', 'nom de la contrepartie', 'nom contrepartie', 'payee', 'merchant', 'beneficiary',
    'naam omschrijving', 'name'],
  holder: ['account holder', 'account holder name', 'rekeninghouder', 'titulaire du compte', 'titulaire',
    'name', 'naam', 'nom'],
  description: ['description', 'omschrijving', 'libelle', 'libelles', 'περιγραφη', 'αιτιολογια',
    'mededeling', 'communication', 'memo', 'narrative', 'desc', 'note', 'notes', 'reference', 'details'],
  details: ['details', 'detail', 'mededelingen', 'message', 'bericht', 'additional information'],
  category: ['category', 'categorie', 'κατηγορια', 'cat', 'tag'],
  status: ['status', 'state', 'statut', 'κατασταση'],
  fee: ['fee', 'fees', 'frais', 'kosten', 'προμηθεια'],
}
// Headers that look like a field but are something else: running balances
// and value dates (interest dates, not when the money moved).
const NOT_AMOUNT = /(balance|saldo|solde|υπολοιπο|running)/
const VALUE_DATE = /(value date|valuta|date valeur|αξιασ|τοκισμοσ)/

const ALL_KEYWORDS = new Set(Object.values(KEYWORDS).flat())

// How header-like a row is: one point per short cell that is a known header
// word, a hundred for a whole bank signature.
function headerScore(row) {
  const cells = row.map((c) => (typeof c === 'string' ? normHeader(c) : null))
  if (cells.filter(Boolean).length < 2) return 0
  const preset = matchPreset(row.map((c) => String(c ?? '')))
  let score = preset ? 100 : 0
  for (const c of cells) if (c && c.length <= 40 && isKeyword(c)) score++
  return score
}
function isKeyword(c) {
  if (ALL_KEYWORDS.has(c)) return true
  for (const k of ALL_KEYWORDS) if (k.length > 3 && c.startsWith(`${k} `)) return true
  return false
}

// The header row: the most header-like one with at least two known words
// among the first 50 rows, or a whole bank signature further down (Revolut's
// consolidated statement opens with hundreds of lines of account summaries).
// { row, score }; row 0 and score 0 when nothing qualifies (a plain sheet).
const PREAMBLE_ROWS = 50
const SIGNATURE_ROWS = 5000
export function locateHeader(aoa) {
  let row = 0
  let score = 1
  for (let i = 0; i < Math.min(aoa.length, SIGNATURE_ROWS); i++) {
    const s = headerScore(aoa[i] ?? [])
    if (s > score && (i < PREAMBLE_ROWS || s >= 100)) { row = i; score = s }
  }
  return { row, score: score > 1 ? score : 0 }
}

// 'dmy' | 'mdy' | 'ymd' for a date column: a first part above 12 proves
// day-first, a second part above 12 proves month-first; otherwise the bank's
// (or Europe's) default.
export function detectDateOrder(values, fallback = 'dmy') {
  let dmy = 0; let mdy = 0; let ymdN = 0; let n = 0
  for (const v of values) {
    if (typeof v !== 'string') continue
    const m = /^\s*(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,4})/.exec(v)
    if (!m) continue
    n++
    if (m[1].length === 4) ymdN++
    else if (+m[1] > 12) dmy++
    else if (+m[2] > 12) mdy++
  }
  if (n && ymdN > n / 2) return 'ymd'
  if (dmy && !mdy) return 'dmy'
  if (mdy && !dmy) return 'mdy'
  return fallback
}

// ',' | '.' for an amount column written as text: "1.234,56" and "12,50" vote
// comma, "1,234.56" and "12.50" vote dot. Spreadsheet numbers don't vote.
export function detectDecimal(values, fallback = '.') {
  let comma = 0; let dot = 0
  for (const v of values) {
    if (typeof v !== 'string') continue
    const s = v.replace(/[^\d.,]/g, '')
    if (/,\d{1,2}$/.test(s) || /\.\d{3},\d+$/.test(s)) comma++
    else if (/\.\d{1,2}$/.test(s) || /,\d{3}\.\d+$/.test(s)) dot++
  }
  if (comma > dot) return ','
  if (dot > comma) return '.'
  return fallback
}

// A stable key for "this layout of file", to remember a confirmed mapping.
export function headerSignature(headers) {
  return headers.map(normHeader).join('|')
}

// The remembered mapping for this header layout, if it still fits: only known
// fields, each pointing at a header that exists (stored data is untrusted —
// it may be stale or hand-edited). Null when there is none.
const FIELD_KEYS = new Set(IMPORT_FIELDS.map((f) => f.key))
export function savedMappingFor(saved, headers) {
  const sig = headerSignature(headers)
  const m = saved && Object.hasOwn(saved, sig) ? saved[sig] : null
  if (!m || typeof m !== 'object') return null
  const out = {}
  for (const [k, v] of Object.entries(m)) {
    if (FIELD_KEYS.has(k)) {
      if (typeof v !== 'string' || (v && !headers.includes(v))) return null
      if (v) out[k] = v
    }
  }
  out.dateOrder = ['dmy', 'mdy', 'ymd'].includes(m.dateOrder) ? m.dateOrder : 'dmy'
  out.decimal = m.decimal === ',' ? ',' : '.'
  return out.date && (out.amount || (out.debit && out.credit)) ? out : null
}

const share = (values, ok) => {
  const filled = values.filter((v) => v != null && String(v).trim() !== '')
  return filled.length ? filled.filter(ok).length / filled.length : 0
}

// Generic mapping from header words, each candidate checked against the
// column's content (a "Type" column only counts as a debit/credit marker if
// its cells read like one). Falls back to content alone for date and amount.
function genericMapping(headers, rows) {
  const norm = headers.map(normHeader)
  const col = (i) => rows.slice(0, 200).map((r) => r[i])
  const taken = new Set()
  const mapping = {}
  const pick = (field, ok = () => true, exclude) => {
    const skip = new Set(taken)
    for (;;) {
      const i = findHeader(norm, KEYWORDS[field], skip)
      if (i === -1) return false
      if (!(exclude && exclude.test(norm[i])) && ok(col(i))) {
        mapping[field] = headers[i]
        taken.add(i)
        return true
      }
      skip.add(i)
    }
  }
  const dateLike = (vals) => share(vals, (v) => parseDate(v, 'dmy') || parseDate(v, 'mdy')) >= 0.6
  const numberLike = (vals) => share(vals, (v) => Number.isFinite(parseAmount(v))) >= 0.6
  const byHeader = { date: pick('date', dateLike, VALUE_DATE) || pick('date', dateLike) }
  pick('type', (vals) => share(vals, (v) => directionOf(v)) >= 0.8)
  byHeader.amount = pick('amount', numberLike, NOT_AMOUNT)
  if (!byHeader.amount) {
    const d = pick('debit', (vals) => share(vals, (v) => Number.isFinite(parseAmount(v))) >= 0.3)
    const c = pick('credit', (vals) => share(vals, (v) => Number.isFinite(parseAmount(v))) >= 0.3)
    if (!(d && c)) { delete mapping.debit; delete mapping.credit }
    byHeader.amount = d && c
  }
  // Content-only fallbacks: the first date-like and number-like columns.
  for (let i = 0; i < headers.length; i++) {
    if (!mapping.date && !taken.has(i) && !VALUE_DATE.test(norm[i]) && share(col(i), (v) => typeof v === 'string' && parseDate(v)) >= 0.8) {
      mapping.date = headers[i]; taken.add(i)
    }
  }
  for (let i = 0; i < headers.length; i++) {
    if (!mapping.amount && !mapping.debit && !taken.has(i) && !NOT_AMOUNT.test(norm[i])
      && share(col(i), (v) => Number.isFinite(parseAmount(v)) && !parseDate(v)) >= 0.8) {
      mapping.amount = headers[i]; taken.add(i)
    }
  }
  // Currency-shaped cells (codes or symbols); unsupported ones are row errors later.
  pick('currency', (vals) => share(vals, (v) => /^[A-Z]{3}$/.test(normalizeCurrency(v))) >= 0.8
    && share(vals, (v) => CURRENCIES.includes(normalizeCurrency(v))) >= 0.5)
  pick('status')
  // The same name on every row is the account holder, not a payee (KBC's
  // "Name" column); a counterparty column varies.
  const constant = (vals) => {
    const filled = vals.map((v) => String(v ?? '').trim()).filter(Boolean)
    return filled.length >= 3 && new Set(filled).size === 1
  }
  pick('counterparty', (vals) => !constant(vals))
  pick('holder', constant)
  pick('description')
  pick('details')
  pick('category')
  if (mapping.amount) pick('fee', numberLike)
  return { mapping, byHeader: byHeader.date && byHeader.amount }
}

// Fraction of the first 100 transaction rows that turn into valid drafts.
function validity(rows, mapping) {
  const sample = rows.slice(0, 100)
  const signed = signedConvention(sample, mapping)
  let ok = 0; let counted = 0
  for (const r of sample) {
    const d = rowToDraft(r, mapping, 'EUR', { signed })
    if (d.skip) continue
    counted++
    // A currency outside our list is the row's problem, not the mapping's.
    if (!d.error || d.error.startsWith('unsupported currency')) ok++
  }
  return counted ? ok / counted : 0
}

// Complete a mapping with the column's date order and decimal separator.
function withFormats(mapping, rows, defaults = {}) {
  const vals = (key) => (mapping[key] ? rows.slice(0, 300).map((r) => r[mapping[key]]) : [])
  return {
    ...mapping,
    dateOrder: detectDateOrder(vals('date'), defaults.dateOrder),
    decimal: detectDecimal([...vals('amount'), ...vals('debit'), ...vals('credit')], defaults.decimal),
  }
}

// Detect the layout of header-keyed `rows`. Returns { preset, mapping,
// confidence } — preset is { id, name } for a recognised bank, else null.
export function detectMapping(headers, rows) {
  const hit = matchPreset(headers)
  if (hit) {
    const mapping = withFormats(hit.mapping, rows, hit.preset)
    return {
      preset: { id: hit.preset.id, name: hit.preset.name },
      mapping,
      confidence: round(0.5 + 0.5 * validity(rows, mapping)),
    }
  }
  const { mapping: raw, byHeader } = genericMapping(headers, rows.map((r) => headers.map((h) => r[h])))
  const mapping = withFormats(raw, rows)
  const complete = mapping.date && (mapping.amount || (mapping.debit && mapping.credit))
  const base = complete ? (byHeader ? 0.85 : 0.6) + (mapping.description || mapping.counterparty ? 0.1 : 0) : 0
  return { preset: null, mapping, confidence: round(base * (complete ? validity(rows, mapping) : 0)) }
}

const round = (n) => Math.round(n * 100) / 100

// The names of the presets, for the upload step's "works with" line.
export const PRESET_NAMES = PRESETS.map((p) => p.name)
