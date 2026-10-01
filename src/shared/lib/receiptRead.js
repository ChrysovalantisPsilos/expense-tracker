// Reading a receipt's text: the merchant, date, total and currency, then the
// check before they fill a form and what they change on it. Pure: the web
// reads the text with Tesseract (receiptScan.js), the native app with the
// phone's own text recognition, and both read it here (the iOS core).
// Unit-tested with OCR text in EN/EL/FR/NL (test/receiptScan.test.js).
import { parseLocaleAmount, foldText, findDates } from './localeParse.js'
import { CURRENCIES, minorToInput, toMinor } from './currency.js'

// Money on a receipt line: always two decimals ("12,50", "1.234,56",
// "€12.50"), never a VAT rate ("24,00%") or part of a longer number.
const MONEY = /(?<![\d.,])-?(?:\d{1,3}(?:[.,]\d{3})+|\d+)[.,]\d{2}(?![\d%]|\s*%)/g
const DATES = /\d{1,4}[-/.]\d{1,2}[-/.]\d{2,4}/g

// Keyword tiers, matched on folded text (lowercase, no accents/tonos).
// Payable-total lines beat plain totals, which beat card-payment lines.
const PAYABLE = /grand\s*total|amount\s*due|total\s*due|balance\s*due|total\s*to\s*pay|to\s*pay|πληρωτεο|γενικο\s*συνολο|συνολο\s*πληρωμ|a\s*payer|total\s*ttc|te\s*betalen|te\s*voldoen/
const TOTAL = /\btotal\b|\btotaal\b|συνολο|\bsum\b|\bmontant\b|\bbedrag\b|\bamount\b/
const PAID = /\bcard\b|\bvisa\b|mastercard|maestro|bancontact|καρτα|\bcarte\b|\bkaart\b|\bcb\b/
// Lines that carry money but not the total: subtotals, tax, cash handed
// over and change, net/ex-VAT values, discounts, item counts.
const NOT_TOTAL = /sub\s*-?\s*tota|sous\s*-?\s*total|subtotaal|μερικο|υποσυνολο|\bvat\b|\btax(?:es)?\b|φπα|\btva\b|\bbtw\b|change|ρεστα|\brendu|monnaie|wisselgeld|\bterug|\bcash\b|μετρητα|especes|contant|tender|καθαρη|\bnet\b|\bht\b|\bexcl|\bitems\b|ειδων|τεμαχ|εκπτωσ|discount|remise|korting|saving|ποντοι|points|punten/

function amountsIn(line) {
  const clean = line.replace(DATES, ' ')
  return (clean.match(MONEY) ?? []).map((m) => parseLocaleAmount(m)).filter((n) => Number.isFinite(n) && n > 0)
}

// The most likely total: the highest-tier keyword line's amount (the last
// amount on the line, or on the next line when OCR split it), the largest
// within a tier; else the largest amount on any line that isn't cash,
// change, tax or a subtotal. Null when there's no money on the receipt.
export function extractTotal(text) {
  const lines = String(text ?? '').split(/\r?\n/)
  const folded = lines.map(foldText)
  const best = [null, null, null] // by tier: paid, total, payable
  folded.forEach((f, i) => {
    const tier = PAYABLE.test(f) ? 2 : NOT_TOTAL.test(f) ? -1 : TOTAL.test(f) ? 1 : PAID.test(f) ? 0 : -1
    if (tier < 0) return
    let amounts = amountsIn(lines[i])
    if (!amounts.length && lines[i + 1] && !/\p{L}{3,}/u.test(lines[i + 1])) amounts = amountsIn(lines[i + 1])
    if (!amounts.length) return
    const n = amounts[amounts.length - 1]
    best[tier] = Math.max(best[tier] ?? 0, n)
  })
  const hit = best[2] ?? best[1] ?? best[0]
  if (hit != null) return hit
  const all = lines.filter((_, i) => !NOT_TOTAL.test(folded[i])).flatMap(amountsIn)
  return all.length ? Math.max(...all) : null
}

// The receipt's date (YYYY-MM-DD) or null: the first date on it, day-first
// unless only month-first makes sense; numeric or with a month name in
// EN/FR/NL/EL.
export function extractDate(text) {
  return findDates(text)[0] ?? null
}

// Header lines that aren't the shop's name.
const NOT_MERCHANT = /^(tel|τηλ|phone|fax|vat|a\s*f\s*m|αφμ|δου|btw|tva|ondernemingsnummer|www|http|e-?mail|receipt|αποδειξη|αποδ|invoice|τιμολογιο|facture|ticket|kassabon|kasticket|welcome|bienvenue|welkom|καλωσ|date|ημερομηνια|datum|cashier|ταμειο|ταμιασ|order|table|τραπεζι)/

// The merchant: the first meaningful line near the top — at least three
// letters, not an address/tax-id/phone/date/amount line.
export function extractMerchant(text) {
  const lines = String(text ?? '').split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean)
  for (const line of lines.slice(0, 8)) {
    const letters = (line.match(/\p{L}/gu) ?? []).length
    if (letters < 3 || letters < line.replace(/\s/g, '').length / 2) continue
    const f = foldText(line).replace(/^[^\p{L}\p{N}]+/u, '')
    if (NOT_MERCHANT.test(f) || findDates(line).length || amountsIn(line).length) continue
    return line.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}.)]+$/gu, '').slice(0, 60)
  }
  return null
}

// The receipt's currency as an ISO code, or null: the most frequent symbol
// or code on it.
const CURRENCY_MARKS = [
  ['EUR', /€|\beur\b|\beuro/gi], ['GBP', /£|\bgbp\b/gi], ['USD', /\$|\busd\b/gi], ['CHF', /\bchf\b/gi],
]
export function extractCurrency(text) {
  let best = null
  let bestCount = 0
  for (const [code, re] of CURRENCY_MARKS) {
    const n = (String(text ?? '').match(re) ?? []).length
    if (n > bestCount) { best = code; bestCount = n }
  }
  return best
}

// Everything a form needs from the OCR text.
export function readReceipt(text) {
  return {
    merchant: extractMerchant(text),
    date: extractDate(text),
    total: extractTotal(text),
    currency: extractCurrency(text),
  }
}

// Recognised words as a receipt's text, one line per printed line: `boxes`
// are [{ text, x, y, w, h }] as Apple's Vision gives them (fractions of the
// image, the origin bottom-left). Top to bottom, a box joins the line whose
// middle its own middle falls within (a label and its amount, printed on one
// line, are read as separate boxes), each line left to right.
export function receiptText(boxes) {
  const mid = (b) => b.y + b.h / 2
  const lines = []
  for (const box of [...(boxes ?? [])].sort((a, b) => mid(b) - mid(a))) {
    const line = lines.find((l) => Math.abs(mid(l[0]) - mid(box)) < Math.min(l[0].h, box.h) / 2)
    if (line) line.push(box)
    else lines.push([box])
  }
  return lines.map((l) => l.sort((a, b) => a.x - b.x).map((b) => String(b.text).trim()).join(' ')).join('\n')
}

// What was read, as the check's fields (strings; '' for nothing read).
export function receiptFields(read) {
  return {
    merchant: read?.merchant ?? '',
    date: read?.date ?? '',
    total: read?.total != null ? String(read.total) : '',
    currency: read?.currency ?? '',
  }
}

// Nothing useful came off the photo (the check says so).
export const receiptNothingRead = (fields) => !fields.merchant && !fields.date && !fields.total

// The checked fields as the scan a form takes: the total a number above zero
// or null, the date YYYY-MM-DD or null, the merchant and currency or null.
export function receiptResult(fields) {
  const total = Number(fields.total)
  return {
    total: fields.total && total > 0 ? total : null,
    date: fields.date || null,
    merchant: String(fields.merchant ?? '').trim() || null,
    currency: fields.currency || null,
  }
}

// What a confirmed receipt changes on a form whose currency and description
// are `currency` and `description`: the amount (in the receipt's currency
// when the app has it, else the form's), the date, the shop's name while the
// description is still empty, and the currency when it differs. Only the
// fields that change are in the answer.
export function receiptFill({ total, date, merchant, currency: scanned }, { currency, description = '' }) {
  const cur = scanned && CURRENCIES.includes(scanned) ? scanned : currency
  const fill = {}
  if (total != null) fill.amount = minorToInput(toMinor(total, cur), cur)
  if (date) fill.date = date
  if (merchant && !String(description).trim()) fill.description = merchant
  if (cur !== currency) fill.currency = cur
  return fill
}
