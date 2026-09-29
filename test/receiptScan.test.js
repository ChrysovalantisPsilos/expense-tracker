import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  extractTotal, extractDate, extractMerchant, extractCurrency, readReceipt, ocrPaths, OCR_ASSET_DIR,
} from '../src/shared/lib/receiptScan.js'

const receipt = (name) => readFileSync(new URL(`./fixtures/receipts/${name}`, import.meta.url), 'utf8')

test('readReceipt: each fixture receipt reads to its merchant, date, total and currency', () => {
  const cases = [
    // English café: TOTAL beats subtotal, VAT, cash and change.
    ['en-cafe.txt', { merchant: 'THE BEAN HOUSE', date: '2026-09-14', total: 13.3, currency: 'EUR' }],
    // Greek supermarket: ΣΥΝΟΛΟ, not ΜΕΡΙΚΟ ΣΥΝΟΛΟ or the VAT table; date at the bottom.
    ['el-supermarket.txt', { merchant: 'ΣΚΛΑΒΕΝΙΤΗΣ', date: '2026-09-21', total: 9.4, currency: null }],
    // Greek taverna: ΠΛΗΡΩΤΕΟ with the amount on the next line, Greek month name.
    ['el-taverna.txt', { merchant: 'ΤΑΒΕΡΝΑ Ο ΜΙΧΑΛΗΣ', date: '2026-09-05', total: 36.5, currency: 'EUR' }],
    // French bakery: "Total à payer" beats Sous-total TTC and Total HT; "03 août 2026".
    ['fr-boulangerie.txt', { merchant: 'BOULANGERIE DUPRÉ', date: '2026-08-03', total: 16.5, currency: 'EUR' }],
    // Dutch supermarket: "Totaal te betalen" beats Subtotaal and BTW; dd.mm.yyyy.
    ['nl-supermarkt.txt', { merchant: 'DELHAIZE LEUVEN', date: '2026-09-18', total: 9.43, currency: 'EUR' }],
    // Noisy OCR: junk punctuation, total split over two lines, two-digit year.
    ['en-noisy.txt', { merchant: 'FRESH MART', date: '2026-09-12', total: 7.25, currency: null }],
  ]
  for (const [file, want] of cases) assert.deepEqual(readReceipt(receipt(file)), want, file)
})

test('extractTotal: a total line over subtotal, else the largest amount that isn\'t cash, change or tax; never a date or VAT rate', () => {
  assert.equal(extractTotal('Subtotal 10.00\nTOTAL 12.34'), 12.34)
  assert.equal(extractTotal('GRAND TOTAL: $1,234.56'), 1234.56)
  assert.equal(extractTotal('Amount Due 1.234,56'), 1234.56) // euro-style separators
  assert.equal(extractTotal('TOTAL 12.50\nTOTAL ITEMS 3'), 12.5)
  // The fallback: the largest amount that isn't cash, change or tax.
  assert.equal(extractTotal('Coffee 5.00\nCake 9.99\nThanks!'), 9.99)
  assert.equal(extractTotal('Coffee 5.00\nCash 50.00\nChange 45.00'), 5)
  assert.equal(extractTotal('VAT 24,00% 1,20\nItem 5,00'), 5)
  assert.equal(extractTotal('no money here'), null)
  assert.equal(extractTotal(''), null)
  // Dates and VAT rates are never read as money.
  assert.equal(extractTotal('21.07.26 TOTAL 3,20'), 3.2)
  assert.equal(extractTotal('ΦΠΑ 24,00%\nΣΥΝΟΛΟ 4,96'), 4.96)
})

test('extractDate: ISO, day-first, month-first, named months (EN/FR/NL/EL)', () => {
  assert.equal(extractDate('Date: 2026-01-15'), '2026-01-15')
  assert.equal(extractDate('15/01/2026'), '2026-01-15')
  assert.equal(extractDate('01/15/2026'), '2026-01-15') // month-first auto-detected
  assert.equal(extractDate('15 Jan 2026'), '2026-01-15')
  assert.equal(extractDate('le 2 févr. 2026'), '2026-02-02')
  assert.equal(extractDate('4 mei 2026'), '2026-05-04')
  assert.equal(extractDate('Ημερομηνία 7 Μαΐου 2026'), '2026-05-07')
  assert.equal(extractDate('32/13/2026 then 01-02-26'), '2026-02-01')
  assert.equal(extractDate('no date here'), null)
})

test('extractMerchant: skips tax ids, phones, dates and amounts', () => {
  assert.equal(extractMerchant('ΑΦΜ 123456789\nTel 22 000000\n** LIDL **\n'), 'LIDL')
  assert.equal(extractMerchant('14/09/2026\n12.50\n'), null)
  assert.equal(extractMerchant(''), null)
})

test('extractCurrency: the most frequent symbol or code', () => {
  assert.equal(extractCurrency('€ 3,00\nTOTAL EUR 3,00'), 'EUR')
  assert.equal(extractCurrency('£4.50 total £4.50'), 'GBP')
  assert.equal(extractCurrency('TOTAL 4.50'), null)
})

test('ocrPaths: every OCR engine file comes from our own origin', () => {
  const paths = ocrPaths('https://budgeer.com')
  assert.deepEqual(Object.keys(paths).sort(), ['corePath', 'langPath', 'workerPath'])
  for (const url of Object.values(paths)) {
    assert.ok(url.startsWith(`https://budgeer.com/${OCR_ASSET_DIR}/`), url)
  }
})
