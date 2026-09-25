// Generic statement handling: header rows below a preamble, mapping from
// header words + content, date order and decimal detection, confidence, and
// the remembered-mapping guard.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { parseSheet, rowsToObjects } from '../src/features/import/sheetParse.js'
import {
  findHeaderRow, detectDateOrder, detectDecimal, detectMapping, headerSignature, savedMappingFor,
  CONFIDENCE_THRESHOLD,
} from '../src/features/import/statementDetect.js'
import { rowToDraft, signedConvention, previewDrafts } from '../src/features/import/importMath.js'

const csv = (text) => {
  const { headers, rows, headerRow } = parseSheet(XLSX, new TextEncoder().encode(text))
  const objs = rowsToObjects(headers, rows)
  const detection = detectMapping(headers, objs)
  const signed = signedConvention(objs, detection.mapping)
  return { headers, objs, headerRow, detection, drafts: objs.map((o) => rowToDraft(o, detection.mapping, 'EUR', { signed })) }
}
const brief = (d) => (d.skip ? `skip:${d.skip}` : d.error ? `error:${d.error}` : `${d.spent_at} ${d.kind} ${d.amount_minor}`)

test('findHeaderRow: skips account/period preamble lines', () => {
  const aoa = [
    ['Account statement'], ['IBAN', 'CY00 0000'], ['Period', '01/09/2026 - 30/09/2026'], [],
    ['Transaction Date', 'Value Date', 'Description', 'Debit', 'Credit', 'Balance'],
    ['01/09/2026', '01/09/2026', 'Shop', '12,00', '', '100,00'],
  ]
  assert.equal(findHeaderRow(aoa), 4)
  assert.equal(findHeaderRow([['x', 'y'], ['1', '2']]), 0)
})

test('generic English Debit/Credit statement (Cyprus-style): value date not used, balance ignored', () => {
  const r = csv([
    'Account;CY00 0000 0000 0000',
    'From;01/09/2026;To;30/09/2026',
    'Transaction Date;Value Date;Description;Debit;Credit;Balance',
    '14/09/2026;15/09/2026;CARD PURCHASE ALPHAMEGA NICOSIA;45,10;;1.954,90',
    '13/09/2026;13/09/2026;SALARY;;2.000,00;2.000,00',
  ].join('\n'))
  const m = r.detection.mapping
  assert.equal(m.date, 'Transaction Date')
  assert.equal(m.debit, 'Debit')
  assert.equal(m.credit, 'Credit')
  assert.equal(m.amount, undefined)
  assert.equal(m.decimal, ',')
  assert.ok(r.detection.confidence >= CONFIDENCE_THRESHOLD)
  assert.deepEqual(r.drafts.map(brief), ['2026-09-14 expense 4510', '2026-09-13 income 200000'])
})

test('direction column: D/C, Af/Bij, Débit/Crédit, Χρέωση/Πίστωση', () => {
  const r = csv([
    'Datum,Naam / Omschrijving,Af Bij,Bedrag (EUR)',
    '20260901,Albert Heijn,Af,"12,50"',
    '20260902,Werkgever,Bij,"1.500,00"',
    '20260903,Retour,C,"3,00"',
    '20260904,Loyer,Débit,"700,00"',
    '20260905,Επιστροφή,Πίστωση,"5,00"',
    '20260906,ΔΕΗ,Χρέωση,"50,00"',
  ].join('\n'))
  assert.equal(r.detection.mapping.type, 'Af Bij')
  assert.equal(r.detection.mapping.amount, 'Bedrag (EUR)')
  assert.deepEqual(r.drafts.map(brief), [
    '2026-09-01 expense 1250', '2026-09-02 income 150000', '2026-09-03 income 300',
    '2026-09-04 expense 70000', '2026-09-05 income 500', '2026-09-06 expense 5000',
  ])
})

test('amount notations in one signed column: trailing minus, parentheses', () => {
  const r = csv('Date;Description;Amount\n01/09/2026;A;12,50-\n02/09/2026;B;(3,00)\n03/09/2026;C;1.234,56\n')
  assert.deepEqual(r.drafts.map(brief), ['2026-09-01 expense 1250', '2026-09-02 expense 300', '2026-09-03 income 123456'])
})

test('a plain expense list (all positive, no marker) stays expenses', () => {
  const r = csv('Date,Description,Amount\n2026-09-01,Coffee,3.50\n2026-09-02,Lunch,12\n')
  assert.deepEqual(r.drafts.map(brief), ['2026-09-01 expense 350', '2026-09-02 expense 1200'])
  assert.ok(r.detection.confidence >= CONFIDENCE_THRESHOLD)
})

test('named-month dates in EN / FR / NL / EL', () => {
  const r = csv([
    'Date;Libellé;Montant',
    '21 Jul 2026;A;-1,00',
    '3 août 2026;B;-1,00',
    '4 mrt 2026;C;-1,00',
    '5 Σεπ 2026;D;-1,00',
    'Sep 6, 2026;E;-1,00',
    '07-JAN-26;F;-1,00',
  ].join('\n'))
  assert.deepEqual(r.drafts.map((d) => d.spent_at),
    ['2026-07-21', '2026-08-03', '2026-03-04', '2026-09-05', '2026-09-06', '2026-01-07'])
})

test('detectDateOrder: proven by a part above 12, else the fallback', () => {
  assert.equal(detectDateOrder(['03/04/2026', '25/04/2026']), 'dmy')
  assert.equal(detectDateOrder(['03/04/2026', '04/25/2026']), 'mdy')
  assert.equal(detectDateOrder(['03/04/2026'], 'mdy'), 'mdy')
  assert.equal(detectDateOrder(['2026-04-03 10:00:00']), 'ymd')
  assert.equal(detectDateOrder(['01.02.2026', '13.02.2026']), 'dmy')
})

test('a US-style file is read month-first once one date proves it', () => {
  const r = csv('Date,Description,Amount\n09/01/2026,A,-1.00\n09/30/2026,B,-2.00\n')
  assert.equal(r.detection.mapping.dateOrder, 'mdy')
  assert.deepEqual(r.drafts.map((d) => d.spent_at), ['2026-09-01', '2026-09-30'])
})

test('detectDecimal: comma vs point, numbers do not vote', () => {
  assert.equal(detectDecimal(['1.234,56', '-12,50']), ',')
  assert.equal(detectDecimal(['1,234.56', '-12.50']), '.')
  assert.equal(detectDecimal([12.5, 3], ','), ',')
  assert.equal(detectDecimal(['1.234']), '.')
})

test('currency per row, symbols included; unknown codes are row errors', () => {
  const r = csv('Date,Description,Amount,Currency\n2026-09-01,A,-5,€\n2026-09-02,B,-5,usd\n2026-09-03,C,-5,XBT\n')
  assert.equal(r.detection.mapping.currency, 'Currency')
  assert.deepEqual(r.drafts.map((d) => d.currency ?? d.error), ['EUR', 'USD', 'unsupported currency XBT'])
})

test('balance / summary lines and status rows are left out, not errors', () => {
  const r = csv([
    'Date;Description;Amount;Status',
    '01/09/2026;Opening balance;1.000,00;',
    '01/09/2026;Shop;-5,00;Completed',
    '02/09/2026;Hotel hold;-90,00;Pending',
    ';Total;-95,00;',
    '30/09/2026;Closing balance;995,00;',
  ].join('\n'))
  assert.deepEqual(r.drafts.map(brief), [
    'skip:balance line', '2026-09-01 expense 500', 'skip:pending or declined', 'skip:balance line', 'skip:balance line',
  ])
})

test('confidence: content-only guesses fall below the threshold', () => {
  const r = csv('Col A,Col B,Col C\n01/09/2026,foo,-1.00\n02/09/2026,bar,-2.00\n')
  assert.equal(r.detection.mapping.date, 'Col A')
  assert.equal(r.detection.mapping.amount, 'Col C')
  assert.ok(r.detection.confidence < CONFIDENCE_THRESHOLD, String(r.detection.confidence))
  const none = csv('Name,Notes\nfoo,bar\n')
  assert.equal(none.detection.confidence, 0)
})

test('headerSignature and savedMappingFor: a remembered mapping must still fit', () => {
  const headers = ['Datum', 'Bedrag', 'Omschrijving']
  const sig = headerSignature(headers)
  assert.equal(sig, 'datum|bedrag|omschrijving')
  const good = { date: 'Datum', amount: 'Bedrag', description: 'Omschrijving', dateOrder: 'mdy', decimal: ',' }
  assert.deepEqual(savedMappingFor({ [sig]: good }, headers), good)
  // Stale header, unknown field and junk values are rejected or dropped.
  assert.equal(savedMappingFor({ [sig]: { ...good, amount: 'Gone' } }, headers), null)
  assert.deepEqual(savedMappingFor({ [sig]: { ...good, evil: 'x', dateOrder: 'zzz' } }, headers),
    { ...good, dateOrder: 'dmy' })
  assert.equal(savedMappingFor({ [sig]: { date: 'Datum' } }, headers), null)
  assert.equal(savedMappingFor({}, headers), null)
  assert.equal(savedMappingFor(null, headers), null)
  assert.equal(savedMappingFor(JSON.parse('{"__proto__":{"date":"Datum","amount":"Bedrag"}}'), ['__proto__']), null)
})

test('previewDrafts: first rows plus ready / skipped / error counts', () => {
  const r = csv('Date;Description;Amount;State\n01/09/2026;A;-1,00;COMPLETED\nxx;B;-2,00;COMPLETED\n02/09/2026;C;-3,00;PENDING\n03/09/2026;D;4,00;COMPLETED\n')
  const p = previewDrafts(r.objs, r.detection.mapping, 'EUR', 1)
  assert.equal(p.rows.length, 1)
  assert.equal(p.ready, 2)
  assert.equal(p.skipped, 1)
  assert.equal(p.errors, 1)
  assert.deepEqual(p.firstError, { index: 1, reason: 'missing/invalid date' })
  // Signed file: the positive row is income, exactly as the import will book it.
  assert.equal(previewDrafts(r.objs, r.detection.mapping, 'EUR').rows[1].kind, 'income')
  assert.equal(previewDrafts(r.objs, {}, 'EUR').ready, 0)
})

test('generic mapping: a name that is the same on every row is the holder, not the payee', () => {
  const r = csv([
    'Date;Name;Payee;Amount',
    '01/09/2026;DOE JANE;Bakery;-3,20',
    '02/09/2026;DOE JANE;JANE DOE;-100,00',
    '03/09/2026;DOE JANE;Grocer;-20,00',
  ].join('\n'))
  assert.equal(r.detection.mapping.counterparty, 'Payee')
  assert.equal(r.detection.mapping.holder, 'Name')
  assert.deepEqual(r.drafts.map((d) => d.merchant), ['BAKERY', '', 'GROCER'])
  const lone = csv(['Date;Name;Amount', '01/09/2026;DOE JANE;-3,20', '02/09/2026;DOE JANE;-4,00', '03/09/2026;DOE JANE;-5,00'].join('\n'))
  assert.equal(lone.detection.mapping.counterparty, undefined)
  assert.equal(lone.detection.mapping.holder, 'Name')
})
