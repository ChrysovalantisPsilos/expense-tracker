import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ocrPaths, OCR_ASSET_DIR } from '../src/shared/lib/receiptScan.js'
import {
  extractTotal, extractDate, extractMerchant, extractCurrency, readReceipt, receiptText, receiptFields,
  receiptNothingRead, receiptResult, receiptFill,
} from '../src/shared/lib/receiptRead.js'

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

test('receiptText: Vision\'s boxes as printed lines, top to bottom, each left to right', () => {
  // A label and its amount on one printed line, read as two boxes with a little skew.
  const boxes = [
    { text: '13,30', x: 0.7, y: 0.395, w: 0.2, h: 0.04 },
    { text: 'TOTAL', x: 0.1, y: 0.4, w: 0.2, h: 0.04 },
    { text: 'THE BEAN HOUSE', x: 0.2, y: 0.9, w: 0.6, h: 0.05 },
    { text: ' 14/09/2026 ', x: 0.1, y: 0.2, w: 0.3, h: 0.03 },
  ]
  assert.equal(receiptText(boxes), 'THE BEAN HOUSE\nTOTAL 13,30\n14/09/2026')
  assert.deepEqual(readReceipt(receiptText(boxes)),
    { merchant: 'THE BEAN HOUSE', date: '2026-09-14', total: 13.3, currency: null })
  assert.equal(receiptText([]), '')
  assert.equal(receiptText(null), '')
})

test('receiptFields / receiptResult: the check\'s strings, and back to the scan a form takes', () => {
  const read = { merchant: 'Café', date: '2026-09-14', total: 13.3, currency: 'EUR' }
  const fields = receiptFields(read)
  assert.deepEqual(fields, { merchant: 'Café', date: '2026-09-14', total: '13.30', currency: 'EUR' })
  assert.equal(receiptFields({ total: 1300, currency: 'JPY' }).total, '1300')
  assert.equal(receiptFields({ total: 12, currency: null }, 'JPY').total, '12')
  assert.equal(receiptFields({ total: 12, currency: null }).total, '12.00')
  assert.deepEqual(receiptResult(fields), read)
  const none = receiptFields({ merchant: null, date: null, total: null, currency: null })
  assert.deepEqual(none, { merchant: '', date: '', total: '', currency: '' })
  assert.equal(receiptNothingRead(none), true)
  assert.equal(receiptNothingRead({ ...none, currency: 'EUR' }), true)
  assert.equal(receiptNothingRead({ ...none, total: '2' }), false)
  assert.deepEqual(receiptResult({ merchant: '  ', date: '', total: '0', currency: '' }),
    { total: null, date: null, merchant: null, currency: null })
})

test('receiptFill: the amount in the receipt\'s currency when the app has it, the date, the shop while the description is empty', () => {
  const scan = { total: 13.3, date: '2026-09-14', merchant: 'Café', currency: 'GBP' }
  assert.deepEqual(receiptFill(scan, { currency: 'EUR', description: '' }),
    { amount: '13.30', date: '2026-09-14', description: 'Café', currency: 'GBP' })
  // A description typed already stays; the same currency isn't a change.
  assert.deepEqual(receiptFill({ ...scan, currency: 'EUR' }, { currency: 'EUR', description: 'Lunch' }),
    { amount: '13.30', date: '2026-09-14' })
  // A currency the app doesn't have: the form's; a zero-decimal one rounds.
  assert.deepEqual(receiptFill({ ...scan, currency: 'XYZ', merchant: null }, { currency: 'JPY' }),
    { amount: '13', date: '2026-09-14' })
  assert.deepEqual(receiptFill({ total: null, date: null, merchant: null, currency: null }, { currency: 'EUR' }), {})
})
