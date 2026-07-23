// Pure statement-import helpers (no xlsx/supabase imports — unit-testable).

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

export function parseDate(v) {
  if (v instanceof Date && !isNaN(v)) {
    // Local Y-M-D (avoid a UTC shift moving the day).
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`
  }
  if (v == null || v === '') return null
  const d = new Date(v)
  if (!isNaN(d)) return d.toISOString().slice(0, 10)
  return null
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
