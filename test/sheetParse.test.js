import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as XLSX from 'xlsx'
import {
  parseSheet, rowsToObjects, uniqueHeaders, importFileProblem, MAX_IMPORT_BYTES, sectionRows,
} from '../src/features/import/sheetParse.js'
import { rowToDraft } from '../src/features/import/importMath.js'

const bytes = (s) => new TextEncoder().encode(s)

test('SheetJS is the patched 0.20.x build (CVE-2023-30533 / CVE-2024-22363)', () => {
  const [maj, min] = XLSX.version.split('.').map(Number)
  assert.ok(maj > 0 || min >= 20, XLSX.version)
})

test('__proto__ fixture: hostile headers never pollute or replace prototypes', () => {
  const buf = readFileSync(new URL('./fixtures/proto-pollution.csv', import.meta.url))
  const { headers, rows } = parseSheet(XLSX, buf)
  assert.deepEqual(headers, ['Date', 'Amount', '__proto__', 'constructor', 'prototype', 'Column 6', 'Amount (2)'])
  const objs = rowsToObjects(headers, rows)
  // Nothing leaked onto Object.prototype.
  assert.equal(({}).polluted, undefined)
  assert.equal(Object.prototype.polluted, undefined)
  assert.equal(typeof ({}).hasOwnProperty, 'function')
  // "__proto__" is an ordinary key holding the cell's text.
  assert.equal(Object.getPrototypeOf(objs[0]), null)
  assert.equal(objs[0].__proto__, '{"polluted":1}')
  assert.equal(objs[1].__proto__, 'hasOwnProperty')
  assert.equal(objs[0].constructor, 'toString')
  // And the row still imports normally (mapping onto hostile columns too).
  const d = rowToDraft(objs[0], { date: 'Date', amount: 'Amount', description: '__proto__' }, 'EUR')
  assert.equal(d.spent_at, '2026-09-01')
  assert.equal(d.amount_minor, 1250)
  assert.equal(d.description, '{"polluted":1}')
  assert.equal(objs[1]['Amount (2)'], 'dup2')
})

test('parseSheet: CSV cells stay text; .xlsx dates are local calendar days', () => {
  // Text is never date-guessed on read ("03/04/2026" could be either way);
  // the column's order is detected later.
  const buf = bytes('Date,Amount\n2026-09-01,1\n09/30/2026,2\n')
  const { rows } = parseSheet(XLSX, buf)
  assert.deepEqual(rows, [['2026-09-01', '1'], ['09/30/2026', '2']])
  // A real .xlsx date cell is its local calendar day, whatever the timezone.
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Date', 'Amount'], [new Date(2026, 8, 1), 5]]), 'S')
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  assert.deepEqual(parseSheet(XLSX, out).rows, [['2026-09-01', 5]])
})

test('parseSheet: garbage throws a clear message, not an internal error', () => {
  const junk = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5, 6, 7, 8])
  assert.throws(() => parseSheet(XLSX, junk), /couldn’t be read\. Re-export it as CSV/)
})

test('uniqueHeaders: blanks named by position, repeats numbered', () => {
  assert.deepEqual(uniqueHeaders(['A', '', null, 'A', ' A ']), ['A', 'Column 2', 'Column 3', 'A (2)', 'A (3)'])
})

test('sectionRows: every table of the header\'s layout, aligned by column name; the rest left out', () => {
  const h8 = ['Date', 'Description', 'Category', 'Money in/out', 'Balance', 'Tax withheld', 'Other taxes', 'Fees']
  const h13 = ['Date', 'Description', 'Category', 'Money in/out', 'Money in/out', 'Balance', 'Balance',
    'Tax withheld', 'Tax withheld', 'Other taxes', 'Other taxes', 'Fees', 'Fees', '', '']
  const sheets = [[
    ['Personal Account (EUR)', null], ['Transaction statement'], h8,
    ['Jun 4, 2022', 'Shop', 'Merchant', '-€1.00', '€9.00', '€0.00', '€0.00', '€0.00'],
    [null, '', null], // blank: skipped, the table goes on
    ['Jun 5, 2022', 'Cafe', 'Merchant', '-€2.00', '€7.00', '€0.00', '€0.00', '€0.00'],
    ['Total', '', '', '-€3.00'],
    ['Jun 6, 2022', 'after Total', 'Merchant', '-€9.00', '€0.00'], // outside any table
    ['---------'],
    ['Personal Account (USD)'], ['Transaction statement'], h13,
    ['Jun 7, 2022', 'Diner', 'Merchant', '-$1.00', '-€0.92', '$0.00', '€0.00'],
    ['Crypto Transaction Statements'],
    ['Date (of Sale)', 'Date (of Purchase)', 'Description and symbol', 'Units sold', 'Fees'],
    ['Jul 2, 2022', 'Jun 1, 2022', 'BTC', '0.001', '€0.00'],
  ], [
    ['Holidays (EUR)'], h8, ['Jun 8, 2022', 'Pocket', 'Others', '€5.00'],
  ]]
  const { headers, rows, lines } = sectionRows(sheets, h13)
  assert.deepEqual(headers, [...h8, 'Money in/out (2)', 'Balance (2)', 'Tax withheld (2)', 'Other taxes (2)', 'Fees (2)'])
  assert.deepEqual(rows.map((r) => [r[1], r[3], r[8]]), [
    ['Shop', '-€1.00', null], ['Cafe', '-€2.00', null], ['Diner', '-$1.00', '-€0.92'], ['Pocket', '€5.00', null],
  ])
  assert.deepEqual(lines, [4, 6, 13, 3])
  assert.equal(rows[2][4], '$0.00') // the USD table's first Balance is Balance
})

test('parseSheet: of several sheets, the one with the header is read', () => {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Notes'], ['Exported by the bank']]), 'About')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Date', 'Amount'], ['2026-09-01', 5]]), 'Data')
  const { headers, rows, lines } = parseSheet(XLSX, XLSX.write(wb, { type: 'array', bookType: 'xlsx' }))
  assert.deepEqual([headers, rows, lines], [['Date', 'Amount'], [['2026-09-01', 5]], [2]])
})

test('importFileProblem: 5 MB cap and Numbers files, before reading', () => {
  assert.equal(MAX_IMPORT_BYTES, 5 * 1024 * 1024)
  assert.equal(importFileProblem({ name: 'x.csv', size: MAX_IMPORT_BYTES }), null)
  assert.match(importFileProblem({ name: 'x.xlsx', size: MAX_IMPORT_BYTES + 1 }), /limit is 5 MB/)
  assert.match(importFileProblem({ name: 'Budget.NUMBERS', size: 10 }), /Numbers documents/)
})
