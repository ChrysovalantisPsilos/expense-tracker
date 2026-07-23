// Import personal transactions from an Excel/CSV file. Parsing + normalisation
// live here; the page just drives the wizard. Columns are auto-detected and the
// user confirms/overrides the mapping before importing.
import * as XLSX from 'xlsx'
import { supabase } from '../../shared/lib/supabase.js'
import { toMinor, getRate, CURRENCIES } from '../../shared/lib/currency.js'

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

// Parse the first sheet into { headers, rows } (rows keyed by header).
export async function parseWorkbook(file) {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { cellDates: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) return { headers: [], rows: [] }
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false })
  const headers = (aoa[0] || []).map((h) => String(h))
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null })
  return { headers, rows }
}

export function guessMapping(headers) {
  const m = {}
  const lower = headers.map((h) => ({ h, l: String(h).toLowerCase().trim() }))
  for (const field of Object.keys(GUESS)) {
    const hit = lower.find(({ l }) => GUESS[field].some((g) => l === g || l.includes(g)))
    m[field] = hit ? hit.h : ''
  }
  return m
}

function parseAmount(v) {
  if (v == null || v === '') return NaN
  if (typeof v === 'number') return v
  let s = String(v).trim().replace(/[^\d.,-]/g, '')
  if (s.includes(',') && s.includes('.')) s = s.replace(/,/g, '')
  else if (s.includes(',') && !s.includes('.')) s = s.replace(',', '.')
  return Number(s)
}

function parseDate(v) {
  if (v instanceof Date && !isNaN(v)) {
    // Local Y-M-D (avoid a UTC shift moving the day).
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`
  }
  if (v == null || v === '') return null
  const d = new Date(v)
  if (!isNaN(d)) return d.toISOString().slice(0, 10)
  return null
}

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

// Deterministic row identity: the same statement line always maps to the same
// client_uuid, so re-importing a file (or an overlapping export) never
// duplicates — the (user_id, client_uuid) unique constraint absorbs it.
// `occurrence` distinguishes genuinely identical lines in one file (two same
// coffees on the same day) while staying stable across re-imports.
async function deterministicUuid(parts) {
  const data = new TextEncoder().encode(parts.join('|'))
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', data))
  hash[6] = (hash[6] & 0x0f) | 0x40 // uuid shape: version 4
  hash[8] = (hash[8] & 0x3f) | 0x80 // variant 10
  const hex = [...hash.slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

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
export async function buildTransactions({ rows, mapping, userId, baseCurrency, categories, rules = [] }) {
  const catByName = new Map((categories || []).map((c) => [c.name.toLowerCase(), c.id]))
  const rateCache = new Map()
  const rateFor = async (cur) => {
    if (!rateCache.has(cur)) rateCache.set(cur, await getRate(cur, baseCurrency))
    return rateCache.get(cur)
  }
  const sortedRules = [...rules].sort((a, b) => b.pattern.length - a.pattern.length)
  const ruleFor = (desc) => {
    if (!desc) return null
    const upper = desc.toUpperCase()
    return sortedRules.find((r) => upper.includes(r.pattern.toUpperCase()))?.category_id ?? null
  }

  // Sign convention only applies when both signs exist and no Type column.
  const signed = !mapping.type && rows.some((r) => parseAmount(r[mapping.amount]) < 0)
    && rows.some((r) => parseAmount(r[mapping.amount]) > 0)

  const valid = []
  const errors = []
  const seen = new Map() // identity key -> occurrence count
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const amountRaw = parseAmount(r[mapping.amount])
    const spent_at = parseDate(r[mapping.date])
    if (!spent_at) { errors.push({ row: i + 2, reason: 'missing/invalid date' }); continue }
    if (!isFinite(amountRaw) || amountRaw === 0) { errors.push({ row: i + 2, reason: 'missing/invalid amount' }); continue }

    let currency = mapping.currency ? String(r[mapping.currency] ?? '').toUpperCase().trim() : baseCurrency
    if (!CURRENCIES.includes(currency)) currency = baseCurrency

    let kind = 'expense'
    if (mapping.type) {
      const t = String(r[mapping.type] ?? '').toLowerCase()
      if (t.startsWith('income') || t === 'credit' || t === 'cr' || t === 'in') kind = 'income'
    } else if (signed && amountRaw > 0) {
      kind = 'income'
    }

    const description = mapping.description && r[mapping.description] != null
      ? String(r[mapping.description]).slice(0, 500) : null
    const catName = mapping.category ? String(r[mapping.category] ?? '').toLowerCase().trim() : ''
    const category_id = (catName ? (catByName.get(catName) ?? null) : null) ?? ruleFor(description)

    const amount_minor = toMinor(Math.abs(amountRaw), currency)
    const key = `${spent_at}|${amount_minor}|${currency}|${kind}|${description ?? ''}`
    const occurrence = seen.get(key) ?? 0
    seen.set(key, occurrence + 1)

    valid.push({
      user_id: userId,
      kind,
      category_id,
      amount_minor,
      currency,
      exchange_rate: await rateFor(currency),
      description,
      spent_at,
      client_uuid: await deterministicUuid(['import', userId, key, occurrence]),
    })
  }
  return { valid, errors }
}

// Insert in chunks, skipping rows whose deterministic identity already exists
// (a re-imported file, or overlap with a previous export). Returns how many
// were actually new vs skipped as duplicates.
export async function importTransactions(rows) {
  let inserted = 0
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200)
    const { data, error } = await supabase
      .from('transactions')
      .upsert(chunk, { onConflict: 'user_id,client_uuid', ignoreDuplicates: true })
      .select('id')
    if (error) throw new Error(error.message)
    inserted += (data ?? []).length
  }
  return { inserted, duplicates: rows.length - inserted }
}
