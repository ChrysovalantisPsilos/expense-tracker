// The statement export end to end, minus the network: generate-report's
// workbook content (statementSheets) written by SheetJS, sent back through
// fileResponse and received by functions-js (what supabase.functions.invoke
// runs in the app), then saved via toBlob. Regression: the Excel file used to
// arrive corrupted because its Content-Type made functions-js read the zip as
// text. Node strips the TypeScript types.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import * as XLSX from 'xlsx'
import { buildStatement, pendingNote, safeCell, statementSheets, yearlyNote } from '../supabase/functions/generate-report/statementMath.ts'
import { FILE_TYPES, fileResponse } from '../supabase/functions/_shared/files.ts'
import { toBlob } from '../src/shared/lib/download.js'

// functions-js ships CommonJS; its ESM build has extensionless imports.
const { FunctionsClient } = createRequire(import.meta.url)('@supabase/functions-js')

// Receive `res` the way the app does: invoke → toBlob with the format's type.
async function receive(res, format) {
  const client = new FunctionsClient('https://project.test/functions/v1', { customFetch: async () => res })
  const { data, error } = await client.invoke('generate-report', { body: {} })
  assert.equal(error, null)
  return toBlob(data, FILE_TYPES[format])
}

// my_transactions order: newest first. A yearly payment in the period, one
// paid before it, a pending foreign row, and text that looks like formulas.
const txns = [
  { spent_at: '2026-09-20', kind: 'expense', amount_minor: 5000, currency: 'EUR', exchange_rate: 1,
    description: '=HYPERLINK("http://evil.example")', categories: { name: 'Food & drink: [groceries]' } },
  { spent_at: '2026-09-12', kind: 'expense', amount_minor: 2000, currency: 'GBP', exchange_rate: null,
    description: 'Taxi', categories: { name: 'Travel' } },
  { spent_at: '2026-09-10', kind: 'expense', amount_minor: 24005, currency: 'EUR', exchange_rate: 1,
    spread_months: 12, description: 'Insurance', categories: { name: 'Bills' } },
  { spent_at: '2026-09-03', kind: 'income', amount_minor: 250000, currency: 'EUR', exchange_rate: 1,
    description: '+ bonus', categories: { name: 'Salary' } },
  { spent_at: '2026-03-15', kind: 'expense', amount_minor: 12000, currency: 'EUR', exchange_rate: 1,
    spread_months: 12, description: 'Gym', categories: { name: 'Sport' } },
]
const rules = [
  { is_active: true, kind: 'expense', frequency: 'yearly', interval_n: 1, amount_minor: 12000, currency: 'EUR',
    next_run: '2027-03-15', description: 'Gym' },
  { is_active: true, kind: 'expense', frequency: 'yearly', interval_n: 1, amount_minor: 9900, currency: 'USD',
    next_run: '2026-12-01', description: '@cloud storage' },
]
const SEP = { from: '2026-09-01', to: '2026-09-30' }
const MODES = {
  spread: SEP,
  separate: { ...SEP, separateYearly: true, rules },
}

function sheetsFor(mode) {
  const stmt = buildStatement(txns, 'EUR', MODES[mode])
  const notes = [pendingNote(stmt.pending), yearlyNote(stmt.yearlyMode)].filter(Boolean)
  return statementSheets(stmt, 'EUR', notes)
}

// What generate-report's buildXlsx does with the sheets.
function workbookBytes(sheets) {
  const wb = XLSX.utils.book_new()
  for (const s of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s.rows), s.name)
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }))
}

for (const mode of Object.keys(MODES)) {
  test(`Excel statement (${mode} yearly) reaches the saved file byte for byte and opens`, async () => {
    const sheets = sheetsFor(mode)
    const bytes = workbookBytes(sheets)
    const blob = await receive(fileResponse(bytes, 'xlsx', 'financial-statement_2026-09-01_2026-09-30.xlsx'), 'xlsx')
    assert.equal(blob.type, FILE_TYPES.xlsx)
    const saved = new Uint8Array(await blob.arrayBuffer())
    assert.deepEqual(saved, bytes)

    const wb = XLSX.read(saved, { type: 'array' })
    assert.deepEqual(wb.SheetNames, sheets.map((s) => s.name))
    const txnRows = XLSX.utils.sheet_to_json(wb.Sheets.Transactions, { header: 1 })
    assert.deepEqual(txnRows[0], ['Date', 'Type', 'Category', 'Description', 'Currency', 'Amount', 'Amount (EUR)', 'Yearly'])
    assert.equal(txnRows.length, 1 + 4) // the four rows paid in September
    const pending = txnRows.find((r) => r[4] === 'GBP')
    assert.equal(pending[6], 'Rate pending')
  })
}

test('a PDF reaches the saved file byte for byte', async () => {
  const bytes = new TextEncoder().encode('%PDF-1.7\nâãÏÓ binary')
  const blob = await receive(fileResponse(bytes, 'pdf', 'Trip "to" Lisbon.pdf'), 'pdf')
  assert.equal(blob.type, FILE_TYPES.pdf)
  assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), bytes)
})

test('fileResponse: a safe attachment filename', () => {
  const res = fileResponse(new Uint8Array(), 'pdf', 'Trip "to" Lisbon\r\n.pdf')
  assert.equal(res.headers.get('Content-Disposition'), 'attachment; filename="Trip-to-Lisbon-.pdf"')
})

test('statementSheets: valid, unique sheet names and plain cells only', () => {
  for (const mode of Object.keys(MODES)) {
    const sheets = sheetsFor(mode)
    const names = sheets.map((s) => s.name)
    assert.equal(new Set(names).size, names.length)
    for (const s of sheets) {
      assert.ok(s.name.length > 0 && s.name.length <= 31, s.name)
      assert.doesNotMatch(s.name, /[[\]:*?/\\]/)
      for (const row of s.rows) {
        for (const cell of row) {
          assert.ok(typeof cell === 'string' || Number.isFinite(cell), `${s.name}: ${cell}`)
        }
      }
    }
  }
  assert.deepEqual(sheetsFor('spread').map((s) => s.name), ['Summary', 'Transactions'])
  assert.deepEqual(sheetsFor('separate').map((s) => s.name), ['Summary', 'Transactions', 'Yearly subscriptions'])
})

test('statementSheets: formula-like text is kept as text', () => {
  const cells = sheetsFor('separate').flatMap((s) => s.rows.flat())
  assert.ok(cells.includes('\'=HYPERLINK("http://evil.example")'))
  assert.ok(cells.includes('\'+ bonus'))
  assert.ok(cells.includes('\'@cloud storage'))
  assert.equal(safeCell('-5 refund'), '\'-5 refund')
  assert.equal(safeCell('Lunch'), 'Lunch')
})
