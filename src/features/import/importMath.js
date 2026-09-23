// Pure statement-import helpers (no xlsx/supabase — unit-testable): turning
// one raw statement row + a column mapping into a transaction draft.
import { toMinor, CURRENCIES } from '../../shared/lib/currency.js'
import { isoDate } from '../../shared/lib/dates.js'
import { parseLocaleAmount, parseDateText, ymd, foldText } from '../../shared/lib/localeParse.js'

// A merchant key for rules: strip numbers/dates/punctuation and generic bank
// prefixes, keep the first meaningful word — so "BANCONTACT LIDL 1234 BRUXELLES"
// and "LIDL 992 GENT" both become "LIDL" and share one rule. The noise words
// cover the EN/FR/NL/EL boilerplate banks put in front of the merchant.
const BANK_NOISE = new Set([
  'POS', 'CARD', 'PAYMENT', 'PURCHASE', 'VISA', 'MASTERCARD', 'DEBIT',
  'CREDIT', 'TRANSFER', 'TO', 'FROM', 'THE',
  'BETALING', 'MET', 'DEBETKAART', 'BANCONTACT', 'MAESTRO', 'PAYCONIQ', 'BY', 'OVERSCHRIJVING',
  'NAAR', 'VAN', 'AANKOOP', 'PAIEMENT', 'AVEC', 'CARTE', 'VIREMENT', 'VERS',
  'ACHAT', 'ΑΓΟΡΑ', 'ΚΑΡΤΑ', 'ΜΕ', 'ΣΕ', 'ΑΠΟ', 'ΠΛΗΡΩΜΗ', 'ΜΕΤΑΦΟΡΑ',
])
export function merchantKey(description) {
  if (!description) return ''
  const words = String(description).toUpperCase()
    .replace(/[0-9]+[./-][0-9./-]+/g, ' ')  // dates & card fragments
    .replace(/[^A-ZΑ-ΩÄÖÜÀ-Þ]+/gu, ' ')     // keep letters only
    .trim().split(/\s+/).filter((w) => w.length >= 2)
  const core = words.filter((w) => !BANK_NOISE.has(w))
  if (core[0] && core[0].length >= 3) return core[0]
  return core.slice(0, 2).join(' ') || words.slice(0, 2).join(' ')
}

// A cell as an amount. Spreadsheet numbers pass through; text is parsed with
// the column's decimal separator when known (see detectDecimal).
export function parseAmount(v, decimal) {
  if (typeof v === 'number') return v
  return parseLocaleAmount(v, decimal)
}

// Excel stores dates as days since 1899-12-30; a date column that SheetJS
// didn't type as a date arrives as such a serial number.
const EXCEL_EPOCH = Date.UTC(1899, 11, 30)
function fromExcelSerial(n) {
  const d = new Date(EXCEL_EPOCH + Math.floor(n) * 86400000)
  return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
}

// A statement date as local YYYY-MM-DD, or null. `order` says how to read an
// all-numeric d/m/y date: 'dmy' (Europe, the default), 'mdy' or 'ymd' — the
// importer detects it per column (detectDateOrder), because "03/04/2026" is
// only unambiguous in context. Text is read by parseDateText (ISO taken
// literally, yyyymmdd, named months in EN/FR/NL/EL); Date cells give their
// local calendar day (never toISOString); numbers are Excel serials.
export function parseDate(v, order = 'dmy') {
  if (v instanceof Date) return isNaN(v) ? null : isoDate(v)
  if (typeof v === 'number') return v > 20000 && v < 80000 ? fromExcelSerial(v) : null
  if (v == null) return null
  return parseDateText(String(v), order)
}

// Debit/credit marker cells: D/C, Dr/Cr, Af/Bij (NL), Débit/Crédit (FR),
// Χ/Π and Χρέωση/Πίστωση (EL), plus plain income/expense words.
const EXPENSE_WORDS = new Set(['d', 'dr', 'debit', 'debet', 'af', 'χ', 'χρεωση', 'out', 'expense',
  'withdrawal', 'uitgave', 'depense', 'εξοδο', 'εξοδα'])
const INCOME_WORDS = new Set(['c', 'cr', 'credit', 'bij', 'π', 'πιστωση', 'in', 'income',
  'deposit', 'inkomst', 'inkomsten', 'revenu', 'recette', 'εσοδο', 'εσοδα'])
export function directionOf(value) {
  const t = foldText(value).replace(/[^\p{L}]/gu, '')
  if (!t) return null
  if (EXPENSE_WORDS.has(t) || t.startsWith('expense')) return 'expense'
  if (INCOME_WORDS.has(t) || t.startsWith('income')) return 'income'
  return null
}

// A currency cell as an ISO code: "eur", "€" and " EUR " are all EUR. Blank
// is ''. Anything else comes back upper-cased (rowToDraft rejects it).
const SYMBOLS = { '€': 'EUR', '$': 'USD', '£': 'GBP', '¥': 'JPY', 'CHF': 'CHF' }
export function normalizeCurrency(raw) {
  const s = String(raw ?? '').trim().toUpperCase()
  return SYMBOLS[s] ?? s
}

// Rows a bank lists but that aren't (yet) money moving: card holds still
// pending, declined/refused/reverted payments — in EN/FR/NL/EL.
// Matched against the folded (lowercase, unaccented) cell.
const NOT_BOOKED = /pending|declined|reverted|failed|cancel|refus|rejet|geweigerd|afgewezen|in afwachting|en attente|εκκρεμ|απορριφ|ακυρ/
// Balance and total lines some exports mix into the rows.
const SUMMARY = /^(opening|closing|starting|ending|previous|new)\s+balance|^(ancien|nouveau)\s+solde|^solde|^(oud|nieuw|begin|eind)\s*saldo|^saldo|^υπολοιπο|^(νεο|προηγουμενο)\s+(μικτο\s+)?υπολοιπο|^total(e|en)?$|^totaal$|^συνολο$/i

// Payee + memo + details as one description ("LIDL · Card payment"), each
// part once, capped at the column's 500 characters.
function describe(row, mapping) {
  const parts = []
  for (const key of ['counterparty', 'description', 'details']) {
    const v = mapping[key] ? String(row[mapping[key]] ?? '').replace(/\s+/g, ' ').trim() : ''
    if (v && !parts.some((p) => p.includes(v))) parts.push(v)
  }
  return parts.length ? parts.join(' · ').slice(0, 500) : null
}

// The row's signed amount: Amount (minus a separate Fee), or Credit − Debit.
function signedAmount(row, mapping) {
  const dec = mapping.decimal
  if (mapping.amount) {
    const amount = parseAmount(row[mapping.amount], dec)
    const fee = mapping.fee ? parseAmount(row[mapping.fee], dec) : NaN
    return Number.isFinite(fee) ? amount - Math.abs(fee) : amount
  }
  if (mapping.debit || mapping.credit) {
    const debit = mapping.debit ? parseAmount(row[mapping.debit], dec) : NaN
    const credit = mapping.credit ? parseAmount(row[mapping.credit], dec) : NaN
    if (!Number.isFinite(debit) && !Number.isFinite(credit)) return NaN
    return (Number.isFinite(credit) ? Math.abs(credit) : 0) - (Number.isFinite(debit) ? Math.abs(debit) : 0)
  }
  return NaN
}

// Whether a positive amount means income for this file: the case when the
// file is a signed statement (no marker column, no debit/credit split) and
// actually has both signs — a list of positive amounts is a list of spending.
export function signedConvention(rows, mapping) {
  if (mapping.type || !mapping.amount) return false
  let neg = false
  let pos = false
  for (const r of rows) {
    const n = signedAmount(r, mapping)
    if (n < 0) neg = true
    else if (n > 0) pos = true
    if (neg && pos) return true
  }
  return false
}

// Derive a normalized transaction draft from one raw statement row + the column
// mapping. Returns { skip } for lines that aren't transactions (pending or
// declined, balance/summary lines, footers with neither date nor amount),
// { error } when a real-looking row lacks a valid date or a nonzero amount,
// otherwise the parsed fields. `signed` (see signedConvention) treats a
// positive amount as income. Shared by the import preview and the
// authoritative buildTransactions so the two can never derive a row differently.
export function rowToDraft(row, mapping, baseCurrency, { signed = false } = {}) {
  if (mapping.status && NOT_BOOKED.test(foldText(row[mapping.status]))) {
    return { skip: 'pending or declined' }
  }
  const amountRaw = signedAmount(row, mapping)
  const spent_at = parseDate(row[mapping.date], mapping.dateOrder)
  const description = describe(row, mapping)
  if (!spent_at && !Number.isFinite(amountRaw)) return { skip: 'not a transaction' }
  if (description && SUMMARY.test(foldText(description))) return { skip: 'balance line' }
  if (!spent_at) return { error: 'missing/invalid date' }
  if (!Number.isFinite(amountRaw) || amountRaw === 0) return { error: 'missing/invalid amount' }

  // A blank currency cell means the base currency. An unknown code is an
  // error, not "base": booking ฿500 as €500 would silently corrupt totals.
  const rawCurrency = mapping.currency ? normalizeCurrency(row[mapping.currency]) : ''
  const currency = rawCurrency || baseCurrency
  if (!CURRENCIES.includes(currency)) return { error: `unsupported currency ${rawCurrency}` }

  let kind = 'expense'
  if (mapping.type) {
    if (directionOf(row[mapping.type]) === 'income') kind = 'income'
  } else if (!mapping.amount || signed) {
    if (amountRaw > 0) kind = 'income'
  }

  return {
    spent_at, kind, currency, amountRaw,
    amount_minor: toMinor(Math.abs(amountRaw), currency), description,
  }
}

// The live preview under the mapping step: the first `limit` rows as they'd
// be saved, and how many rows are ready / skipped / unreadable — derived by
// the same rowToDraft + sign rule the import uses.
export function previewDrafts(rows, mapping, baseCurrency, limit = 6) {
  const out = { rows: [], ready: 0, skipped: 0, errors: 0, firstError: null }
  if (!mapping.date || !(mapping.amount || mapping.debit || mapping.credit)) return out
  const signed = signedConvention(rows, mapping)
  rows.forEach((r, i) => {
    const d = rowToDraft(r, mapping, baseCurrency, { signed })
    if (d.skip) { out.skipped++; return }
    if (d.error) {
      out.errors++
      out.firstError ??= { index: i, reason: d.error }
      return
    }
    out.ready++
    if (out.rows.length < limit) out.rows.push(d)
  })
  return out
}

// Deterministic row identity: the same statement line always maps to the same
// client_uuid, so re-importing a file (or an overlapping export) never
// duplicates — the (user_id, client_uuid) unique constraint absorbs it.
export async function deterministicUuid(parts) {
  const data = new TextEncoder().encode(parts.join('|'))
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', data))
  hash[6] = (hash[6] & 0x0f) | 0x40 // uuid shape: version 4
  hash[8] = (hash[8] & 0x3f) | 0x80 // variant 10
  const hex = [...hash.slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}
