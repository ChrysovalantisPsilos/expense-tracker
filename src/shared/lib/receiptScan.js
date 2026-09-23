// On-device receipt OCR (Tesseract.js) + heuristic extraction of the
// merchant, date, total and currency.
//
// Notes:
//  * Tesseract runs entirely in the browser. Its worker, wasm core and the
//    English + Greek trained data are served from our own origin
//    (vite.config.js copies them out of node_modules into OCR_ASSET_DIR),
//    never from a CDN. They stay out of the service-worker precache and are
//    only fetched when someone scans (Tesseract then keeps the language data
//    in IndexedDB). The photo itself is never uploaded or stored.
//  * The image is cleaned up first (receiptImage.js): upright, cropped,
//    downscaled, grayscale, contrast-stretched and binarised.
//  * Extraction is pure and unit-tested with OCR text in EN/EL/FR/NL; the
//    user confirms (and can correct) what was read before it fills a form.
import { parseLocaleAmount, foldText, findDates } from './localeParse.js'

// Build-output folder for the OCR engine files; vite.config.js writes it.
export const OCR_ASSET_DIR = 'tesseract'
// English + Greek: receipts in Cyprus/Greece mix both scripts.
const OCR_LANGS = 'eng+ell'

// Absolute same-origin URLs for Tesseract's worker, core and language data.
// Absolute because the worker boots from a blob: URL, where relative paths
// don't resolve. corePath is a folder: Tesseract picks the SIMD or plain
// LSTM core inside it for the device.
export function ocrPaths(origin) {
  const base = `${origin}/${OCR_ASSET_DIR}`
  return { workerPath: `${base}/worker.min.js`, corePath: `${base}/core`, langPath: `${base}/lang` }
}

// Run OCR on a prepared canvas. onProgress receives 0..1. Returns the raw
// text. Tesseract is imported dynamically so it only loads when the user
// actually scans (keeps the initial bundle small). Page segmentation 4 (one
// column of variable-size text) suits receipts better than the default.
async function ocrImage(image, onProgress) {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker(OCR_LANGS, 1, {
    ...ocrPaths(window.location.origin),
    logger: (m) => {
      if (m.status === 'recognizing text' && onProgress) onProgress(m.progress)
    },
  })
  try {
    await worker.setParameters({ tessedit_pageseg_mode: '4', preserve_interword_spaces: '1' })
    const { data } = await worker.recognize(image)
    return data.text || ''
  } finally {
    await worker.terminate()
  }
}

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

// OCR a prepared image, then extract the fields.
export async function scanReceipt(image, onProgress) {
  const text = await ocrImage(image, onProgress)
  return { ...readReceipt(text), text }
}
