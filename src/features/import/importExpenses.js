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

// Turn raw rows + a mapping into ready-to-insert transactions, collecting
// per-row errors for anything unparseable.
export async function buildTransactions({ rows, mapping, userId, baseCurrency, categories }) {
  const catByName = new Map((categories || []).map((c) => [c.name.toLowerCase(), c.id]))
  const rateCache = new Map()
  const rateFor = async (cur) => {
    if (!rateCache.has(cur)) rateCache.set(cur, await getRate(cur, baseCurrency))
    return rateCache.get(cur)
  }

  const valid = []
  const errors = []
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
    }

    const description = mapping.description && r[mapping.description] != null
      ? String(r[mapping.description]).slice(0, 500) : null
    const catName = mapping.category ? String(r[mapping.category] ?? '').toLowerCase().trim() : ''
    const category_id = catName ? (catByName.get(catName) ?? null) : null

    valid.push({
      user_id: userId,
      kind,
      category_id,
      amount_minor: toMinor(Math.abs(amountRaw), currency),
      currency,
      exchange_rate: await rateFor(currency),
      description,
      spent_at,
      client_uuid: crypto.randomUUID(),
    })
  }
  return { valid, errors }
}

// Insert in chunks. Idempotent per client_uuid (unique), so a partial retry
// won't duplicate.
export async function importTransactions(rows) {
  let inserted = 0
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200)
    const { error } = await supabase
      .from('transactions')
      .upsert(chunk, { onConflict: 'user_id,client_uuid' })
    if (error) throw new Error(error.message)
    inserted += chunk.length
  }
  return inserted
}
