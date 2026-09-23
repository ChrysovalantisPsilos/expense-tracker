// Pure statement-import helpers (no xlsx/supabase — unit-testable). Only depends
// on the pure money helpers in currency.js.
import { toMinor, CURRENCIES } from '../../shared/lib/currency.js'
import { isoDate } from '../../shared/lib/dates.js'

// A merchant key for rules: strip numbers/dates/punctuation and generic bank
// prefixes, keep the first meaningful word — so "POS LIDL 1234 NICOSIA" and
// "LIDL 992 LARNACA" both become "LIDL" and share one rule.
const BANK_NOISE = new Set([
  'POS', 'CARD', 'PAYMENT', 'PURCHASE', 'VISA', 'MASTERCARD', 'DEBIT',
  'CREDIT', 'TRANSFER', 'TO', 'FROM', 'THE',
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

export function parseAmount(v) {
  if (v == null || v === '') return NaN
  if (typeof v === 'number') return v
  let s = String(v).trim().replace(/[^\d.,-]/g, '')
  if (s.includes(',') && s.includes('.')) s = s.replace(/,/g, '')
  else if (s.includes(',') && !s.includes('.')) s = s.replace(',', '.')
  return Number(s)
}

// A statement date as local YYYY-MM-DD. ISO text ("2026-09-21", optionally
// with a time) is taken literally: new Date('2026-09-21') is UTC midnight,
// which is the 20th west of UTC. Other text and Date cells use the local
// calendar day (never toISOString, which shifts a day east of UTC).
export function parseDate(v) {
  if (v instanceof Date) return isNaN(v) ? null : isoDate(v)
  if (v == null || v === '') return null
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/.exec(String(v).trim())
  if (iso) {
    const [, y, m, d] = iso.map(Number)
    const check = new Date(y, m - 1, d)
    return check.getMonth() === m - 1 && check.getDate() === d ? iso[0].slice(0, 10) : null
  }
  const d = new Date(v)
  return isNaN(d) ? null : isoDate(d)
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

// Derive a normalized transaction draft from one raw statement row + the column
// mapping. Returns { error } when the row lacks a valid date or a nonzero
// amount, otherwise the parsed fields. `signed` (buildTransactions only) treats
// a positive amount as income when the file has no Type column but mixes signs.
// Shared by the import preview and the authoritative buildTransactions so the
// two can never derive a row differently.
export function rowToDraft(row, mapping, baseCurrency, { signed = false } = {}) {
  const amountRaw = parseAmount(row[mapping.amount])
  const spent_at = parseDate(row[mapping.date])
  if (!spent_at) return { error: 'missing/invalid date' }
  if (!isFinite(amountRaw) || amountRaw === 0) return { error: 'missing/invalid amount' }

  // A blank currency cell means the base currency. An unknown code is an
  // error, not "base": booking ฿500 as €500 would silently corrupt totals.
  const rawCurrency = mapping.currency ? String(row[mapping.currency] ?? '').toUpperCase().trim() : ''
  const currency = rawCurrency || baseCurrency
  if (!CURRENCIES.includes(currency)) return { error: `unsupported currency ${rawCurrency}` }

  let kind = 'expense'
  if (mapping.type) {
    const t = String(row[mapping.type] ?? '').toLowerCase()
    if (t.startsWith('income') || t === 'credit' || t === 'cr' || t === 'in') kind = 'income'
  } else if (signed && amountRaw > 0) {
    kind = 'income'
  }

  const description = mapping.description && row[mapping.description] != null
    ? String(row[mapping.description]).slice(0, 500) : null

  return {
    spent_at, kind, currency, amountRaw,
    amount_minor: toMinor(Math.abs(amountRaw), currency), description,
  }
}
