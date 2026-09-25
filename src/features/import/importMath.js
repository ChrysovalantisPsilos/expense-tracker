// Pure statement-import helpers (no xlsx/supabase — unit-testable): turning
// one raw statement row + a column mapping into a transaction draft.
import { toMinor, CURRENCIES } from '../../shared/lib/currency.js'
import { isoDate } from '../../shared/lib/dates.js'
import { parseLocaleAmount, parseDateText, ymd, foldText } from '../../shared/lib/localeParse.js'

// ------------------------------------------------------------ merchant keys
//
// A merchant key groups a statement's rows for the "New merchants" step and
// becomes a saved "description contains → category" rule, so it must (a) name
// the business or person, never the bank's boilerplate or the account holder,
// and (b) be a piece of the row's own description text, or the rule would
// never match again. "BANCONTACT LIDL 1234 BRUXELLES" and "LIDL 992 GENT"
// both give "LIDL" and share one rule.

// Words that never name a merchant: payment-method, operation and
// connective words banks write around it (EN/FR/NL/EL, compared unaccented),
// plus titles and company-form suffixes.
const BANK_NOISE = new Set([
  'POS', 'CARD', 'PAYMENT', 'PURCHASE', 'VISA', 'MASTERCARD', 'DEBIT', 'CREDIT', 'TRANSFER', 'TO',
  'FROM', 'THE', 'BY', 'VIA', 'WITH', 'AT', 'OF', 'TIME', 'EUROPEAN', 'INSTANT', 'INSTANTLY', 'SENDING',
  'RECEIVING', 'MONEY', 'SETTLEMENT', 'CHARGE', 'CHARGES', 'FEE', 'FEES', 'DEPOSIT', 'CASH', 'WITHDRAWAL',
  'ATM', 'STANDING', 'ORDER', 'DIRECT', 'CREDITOR', 'CONTACTLESS', 'APPLE', 'GOOGLE', 'PAY', 'MOBILE',
  'ONLINE', 'ACCOUNT', 'REFUND', 'REPAYMENT', 'BANCONTACT', 'MAESTRO', 'PAYCONIQ',
  // Dutch
  'BETALING', 'MET', 'DEBETKAART', 'BANKKAART', 'KAART', 'OVERSCHRIJVING', 'INSTANTOVERSCHRIJVING', 'NAAR',
  'VAN', 'AANKOOP', 'EUROPESE', 'DOORLOPENDE', 'BETALINGSOPDRACHT', 'DOMICILIERING', 'STORTING', 'OPNAME',
  'GELDOPNAME', 'GELDOPNEMING', 'AFREKENING', 'KOSTEN', 'BIJDRAGE', 'OM', 'UUR', 'SCHULDEISER',
  'TERUGBETALING', 'CONTACTLOOS', 'REKENING',
  // French
  'PAIEMENT', 'AVEC', 'CARTE', 'VIREMENT', 'VERS', 'ACHAT', 'EUROPEEN', 'EUROPEENNE', 'INSTANTANE',
  'DOMICILIATION', 'ORDRE', 'PERMANENT', 'RETRAIT', 'ESPECES', 'DEPOT', 'VERSEMENT', 'FRAIS', 'DECOMPTE',
  'HEURES', 'CREANCIER', 'REMBOURSEMENT', 'COMPTE', 'SANS', 'CONTACT',
  // Greek
  'ΑΓΟΡΑ', 'ΚΑΡΤΑ', 'ΜΕ', 'ΣΕ', 'ΑΠΟ', 'ΠΛΗΡΩΜΗ', 'ΜΕΤΑΦΟΡΑ',
  // titles and company forms
  'MR', 'MRS', 'MS', 'MISS', 'MEJ', 'MEVR', 'MEVROUW', 'DHR', 'MME', 'MLLE', 'BV', 'NV', 'BVBA', 'VZW',
  'SA', 'SRL', 'SPRL', 'ASBL',
])
// Words too broad to be a key alone — the bank's own name is in every card
// line ("WITH KBC DEBIT CARD"), and "CASA"/"SINT" start many names — so the
// next word joins them: "KBC INSURANCE", "CASA VERDE", "SINT PIETER".
const LEAD = new Set(['KBC', 'CBC', 'CASA', 'CHEZ', 'SINT', 'SAINT', 'SANTA', 'SAN', 'STAD', 'VILLE'])

// Where the useful part of a description ends: card numbers, the
// cardholder's name, the bank's merchant-info block.
const TAIL = /\s*\b(?:CARDHOLDER|KAARTHOUDER|TITULAIRE|MERCHANT INFO|INFO VAN DE HANDELAAR|INFO DU COMMER[CÇ]ANT|(?:VIRTUAL |BANK )?CARD NUMBER|BANKKAARTNUMMER|KAARTNUMMER|NUM[EÉ]RO DE (?:LA )?CARTE)\b.*$/
// A card payment's time stamp — "AT 22.01 TIME", "OM 13.55 UUR",
// "À 13.55 HEURES" — the merchant follows it...
const CARD_TIME = /(?:^|\s)(?:AT|OM|[AÀ])\s+\d{1,2}[.:H]\d{2}\s+(?:TIME|UUR|HEURES?|H)\b/
// ...up to the country+postcode ("BE3000", "GR54627") or "WITH/MET/AVEC …".
const CARD_END = /\s+(?:[A-Z]{2}\d{3,6}\b|(?:WITH|MET|AVEC)\b).*$/
// A direct debit's creditor: "CREDITOR : PROXIMUS CREDITOR REF.: …".
const CREDITOR = /\b(?:CREDITOR|SCHULDEISER|CR[EÉ]ANCIER)\s*:\s*(.+?)(?=\s+(?:CREDITOR|SCHULDEISER|CR[EÉ]ANCIER|REF\b|MANDA)|$)/
// A transfer's other party, after the bank label and its BIC:
// "BENEFICIARY'S BANK: REVOBEB2XXX JANE DOE …", "BANKIER OPDRACHTGEVER: KREDBEBB …".
const PARTY = /\b(?:BANKIER (?:BEGUNSTIGDE|OPDRACHTGEVER)|(?:BENEFICIARY|ORDERING PARTY|PAYER|PAYEE)['’]?S BANK|BANQUE (?:DU |DE LA )?(?:B[EÉ]N[EÉ]FICIAIRE|DONNEUR D['’]ORDRE))\s*:\s*[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\s+(.+)$/
const PARTY_END = /\s+(?:(?:AT|OM|[AÀ])\s+\d{1,2}[.:]\d{2}|REFERENTIE|REFERENCE|R[EÉ]F[EÉ]RENCE|MEDEDELING|COMMUNICATION|(?:WITH|MET|AVEC)\b).*$/
// Cash in or out has no third party: the operation itself is the key.
const CASH = /^(?:CASH (?:WITHDRAWAL|DEPOSIT)|WITHDRAWAL|DEPOSIT(?: OF CASH)?|GELDOPNEMING|GELDOPNAME|OPNAME|STORTING|RETRAIT|VERSEMENT|D[EÉ]P[OÔ]T)\b/

function tokens(text) {
  return [...text.matchAll(/\p{L}+/gu)]
    .map((m) => ({ w: foldText(m[0]).toUpperCase(), start: m.index, end: m.index + m[0].length }))
    .filter((t) => t.w.length >= 2 && !/^X+$/.test(t.w)) // "55XX XXXX": masked card digits
}
// A person's name as a set of words, for comparing "DOE JANE" with "Jane Doe".
function nameWords(name) {
  return new Set(tokens(String(name ?? '').toUpperCase()).map((t) => t.w).filter((w) => !BANK_NOISE.has(w)))
}
function sameWords(a, b) {
  return a.size > 0 && a.size === b.size && [...a].every((w) => b.has(w))
}

// The key inside `text` (upper-cased): its first meaningful word, or two
// when the first is short or too broad; '' when there is none. Sliced from
// the text itself so the saved rule still matches it ("ST. PIERRE").
function keyIn(text, holder) {
  const core = tokens(text).filter((t) => !BANK_NOISE.has(t.w) && !holder.has(t.w))
  const [a, b] = core
  if (!a) return ''
  if (a.w.length >= 3 && !LEAD.has(a.w)) return text.slice(a.start, a.end)
  if (b && b.end - a.start <= 40) return text.slice(a.start, b.end)
  return LEAD.has(a.w) ? '' : text.slice(a.start, a.end)
}

// The merchant key of a description. `holder` is the account holder's name
// (when the statement has it): their words are never the key, and a transfer
// whose other party is the holder (between their own accounts) has no key.
const plainText = (description) =>
  String(description).toUpperCase().replace(/\s+/g, ' ').replace(TAIL, '').trim()

// Is the transfer's other party (the name after the bank label and BIC, when
// the statement has no counterparty column) the holder `own` themselves?
function partyIsHolder(party, own) {
  const words = tokens(party).map((t) => t.w).filter((w) => !BANK_NOISE.has(w))
  return own.size > 0 && sameWords(new Set(words.slice(0, own.size)), own)
}

export function merchantKey(description, { holder = '' } = {}) {
  if (!description) return ''
  const own = nameWords(holder)
  const text = plainText(description)
  const cash = CASH.exec(text)
  if (cash) return cash[0]
  const time = CARD_TIME.exec(text)
  if (time) {
    const key = keyIn(text.slice(time.index + time[0].length).replace(CARD_END, ''), own)
    if (key) return key
  }
  const creditor = CREDITOR.exec(text)
  if (creditor) {
    const key = keyIn(creditor[1], own)
    if (key) return key
  }
  const party = PARTY.exec(text)
  if (party) {
    if (partyIsHolder(party[1], own)) return ''
    const key = keyIn(party[1].replace(PARTY_END, ''), own)
    if (key) return key
  }
  const key = keyIn(text, own)
  if (key) return key
  // Nothing but boilerplate ("SETTLEMENT KBC CREDIT CARD"): the operation's
  // own words group these bank-generated lines.
  const label = tokens(text).filter((t) => !own.has(t.w)).slice(0, 2)
  return label.length ? text.slice(label[0].start, label[label.length - 1].end) : ''
}

// The merchant key of a statement row: the counterparty column when it has a
// name, else the description. A row whose counterparty is the account holder
// (the "Name"/"Naam" column, either word order) is a transfer between the
// holder's own accounts — not a merchant — and gets no key.
const cellOf = (row, mapping) => (k) =>
  (mapping[k] ? String(row[mapping[k]] ?? '').replace(/\s+/g, ' ').trim() : '')

// A transfer between the holder's own accounts: the counterparty column (or,
// without one, the party named in the description) is the holder, in either
// word order. Such rows aren't spending or income, so the import leaves them
// out. Needs the holder column; without it nothing counts as own.
export function isOwnTransfer(row, mapping) {
  const cell = cellOf(row, mapping)
  const own = nameWords(cell('holder'))
  if (!own.size) return false
  const counterparty = cell('counterparty')
  if (counterparty) return sameWords(nameWords(counterparty), own)
  const party = PARTY.exec(plainText([cell('description'), cell('details')].filter(Boolean).join(' · ')))
  return !!party && partyIsHolder(party[1], own)
}

export function rowMerchant(row, mapping) {
  const cell = cellOf(row, mapping)
  const holder = cell('holder')
  const counterparty = cell('counterparty')
  if (counterparty) {
    if (sameWords(nameWords(counterparty), nameWords(holder))) return ''
    const key = merchantKey(counterparty, { holder })
    if (key) return key
  }
  return merchantKey([cell('description'), cell('details')].filter(Boolean).join(' · '), { holder })
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
// otherwise the parsed fields plus the row's merchant key. `signed` (see signedConvention) treats a
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
  if (isOwnTransfer(row, mapping)) return { skip: 'own transfer' }
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
    merchant: rowMerchant(row, mapping),
  }
}

// The live preview under the mapping step: the first `limit` rows as they'd
// be saved, and how many rows are ready / skipped / unreadable — derived by
// the same rowToDraft + sign rule the import uses.
export function previewDrafts(rows, mapping, baseCurrency, limit = 6) {
  const out = { rows: [], ready: 0, skipped: 0, ownTransfers: 0, errors: 0, firstError: null }
  if (!mapping.date || !(mapping.amount || mapping.debit || mapping.credit)) return out
  const signed = signedConvention(rows, mapping)
  rows.forEach((r, i) => {
    const d = rowToDraft(r, mapping, baseCurrency, { signed })
    if (d.skip === 'own transfer') { out.ownTransfers++; return }
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
