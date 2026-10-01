// The statement import's pure steps (statementRows.js, importText.js, the
// remembered layouts in statementDetect.js, sheetRead.js): the same ones the
// web page and the native app run.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import {
  SAVE_CHUNK, applyReview, importSummary, mappingComplete, rateSpans, statementPreview, statementRows,
} from '../src/features/import/statementRows.js'
import {
  detectionText, doneText, fileProblem, previewNote, previewRow, readProblem, reasonText, uploadMore,
} from '../src/features/import/importText.js'
import {
  DATE_ORDERS, DECIMALS, detectStatement, headerSignature, mappingUnsure, rememberedWith,
} from '../src/features/import/statementDetect.js'
import { readStatement } from '../src/features/import/sheetRead.js'
import { deterministicUuid, groupIdOf, merchantGroups } from '../src/features/import/importMath.js'
import { rowsToObjects } from '../src/features/import/sheetParse.js'

const mapping = { date: 'Date', amount: 'Amount', description: 'Description', currency: 'Currency', dateOrder: 'ymd', decimal: '.' }
const raw = [
  { Date: '2026-09-01', Amount: '-12.50', Description: 'LIDL LEUVEN 1234', Currency: 'EUR' },
  { Date: '2026-09-02', Amount: '-12.50', Description: 'LIDL GENT 99', Currency: 'EUR' },
  { Date: '2026-09-02', Amount: '-12.50', Description: 'LIDL GENT 99', Currency: 'EUR' },
  { Date: '2026-09-03', Amount: '2500', Description: 'ACME PAYROLL', Currency: 'EUR' },
  { Date: '2026-09-04', Amount: '-20', Description: 'CAFE ROMA', Currency: 'USD' },
  { Date: '2026-09-06', Amount: '-30', Description: 'TAXI', Currency: 'USD' },
  { Date: 'nope', Amount: '-1', Description: 'Broken', Currency: 'EUR' },
  { Date: '', Amount: '', Description: 'Closing balance', Currency: '' },
]
const categories = [
  { id: 'food', name: 'Groceries', kind: 'expense' },
  { id: 'pay', name: 'Salary', kind: 'income' },
]
const lines = raw.map((_, i) => i + 2)

test('mappingComplete: Date with an Amount, or Debit and Credit', () => {
  assert.equal(mappingComplete({ date: 'D', amount: 'A' }), true)
  assert.equal(mappingComplete({ date: 'D', debit: 'X', credit: 'Y' }), true)
  assert.equal(mappingComplete({ date: 'D', debit: 'X' }), false)
  assert.equal(mappingComplete({ amount: 'A' }), false)
  assert.equal(mappingComplete(null), false)
})

test('statementPreview: the rows as saved, with the category a rule gives them', () => {
  const preview = statementPreview(raw, mapping, 'EUR', { categories, rules: [{ pattern: 'lidl', category_id: 'food' }] })
  assert.equal(preview.ready, 6)
  assert.equal(preview.errors, 1)
  assert.equal(preview.skipped, 1)
  assert.equal(preview.rows[0].category_id, 'food')
  assert.equal(preview.rows[3].category_id, null)
})

test('rateSpans: one span per foreign currency, over its rows\' dates', () => {
  const spans = rateSpans(raw, mapping, 'EUR')
  assert.deepEqual([...spans], [['USD', { first: '2026-09-04', last: '2026-09-06' }]])
})

test('statementRows: rates from the series or typed, ids that repeat per identical row, merchants keyed', () => {
  const noRate = statementRows({ rows: raw, mapping, userId: 'u1', baseCurrency: 'EUR', categories, lines })
  assert.deepEqual(noRate.missingRates, [{ currency: 'USD', count: 2 }])
  assert.equal(noRate.valid.length, 4)

  const seriesByCurrency = new Map([['USD', [['2026-09-03', 0.9], ['2026-09-05', 0.92]]]])
  const out = statementRows({ rows: raw, mapping, userId: 'u1', baseCurrency: 'EUR', categories, lines, seriesByCurrency })
  assert.deepEqual(out.missingRates, [])
  assert.deepEqual(out.valid.map((r) => r.exchange_rate), [1, 1, 1, 1, 0.9, 0.92])
  assert.deepEqual(out.errors, [{ row: 8, reason: 'missing/invalid date' }])
  assert.deepEqual(out.skipped, [{ row: 9, reason: 'not a transaction' }])
  // Two identical lines are two entries, each with its own stable id.
  const [, second, third] = out.valid
  assert.equal(second.client_uuid, deterministicUuid(['import', 'u1', '2026-09-02|1250|EUR|expense|LIDL GENT 99', 0]))
  assert.equal(third.client_uuid, deterministicUuid(['import', 'u1', '2026-09-02|1250|EUR|expense|LIDL GENT 99', 1]))
  // Both LIDLs group under one merchant; money in apart from money out.
  const groups = merchantGroups(out.valid, out.merchants)
  assert.deepEqual(groups.map((g) => [g.pattern, g.kind, g.count]),
    [['LIDL', 'expense', 3], ['ACME PAYROLL', 'income', 1], ['CAFE ROMA', 'expense', 1], ['TAXI', 'expense', 1]])

  const typed = statementRows({ rows: raw, mapping, userId: 'u1', baseCurrency: 'EUR', categories, lines, manualRates: { USD: 0.95 } })
  assert.deepEqual(typed.valid.slice(4).map((r) => r.exchange_rate), [0.95, 0.95])
})

test('applyReview: the chosen categories fill their merchants\' rows and become rules', () => {
  const seriesByCurrency = new Map([['USD', [['2026-09-01', 0.9]]]])
  const out = statementRows({ rows: raw, mapping, userId: 'u1', baseCurrency: 'EUR', categories, lines, seriesByCurrency })
  const groups = merchantGroups(out.valid, out.merchants)
  const lidl = groups.find((g) => g.pattern === 'LIDL')
  const review = applyReview(out.valid, out.merchants, groups, { [lidl.id]: 'food', 'income|ACME PAYROLL': '' })
  assert.deepEqual(review.rules, [{ pattern: 'LIDL', category_id: 'food' }])
  assert.deepEqual(review.rows.map((r) => r.category_id), ['food', 'food', 'food', null, null, null])
  assert.equal(groupIdOf(review.rows[0], out.merchants), lidl.id)
})

test('importSummary + doneText: what the done step says', () => {
  const summary = importSummary({ inserted: 3, duplicates: 2 }, {
    errors: [{ row: 8, reason: 'missing/invalid date' }],
    skipped: [{ row: 9, reason: 'own transfer' }, { row: 10, reason: 'balance line' }, { row: 11, reason: 'pending or declined' }],
    rows: [{ spent_at: '2026-09-03' }, { spent_at: '2026-09-01' }],
  })
  assert.deepEqual(summary, {
    inserted: 3, duplicates: 2, failed: 1, errors: [{ row: 8, reason: 'missing/invalid date' }],
    ownTransfers: 1, ignored: 2, range: { from: '2026-09-01', to: '2026-09-03' },
  })
  const words = doneText(summary)
  assert.equal(words.title, 'Imported 3 transactions')
  assert.match(words.dated, /^Dated .+ – .+\. “View transactions” opens those dates\.$/)
  assert.deepEqual(words.notes, [
    '2 rows were already imported before and got skipped — re-importing never duplicates.',
    'Skipped 1 row with a missing/invalid date or amount (e.g. row 8: missing/invalid date).',
    'Left out 1 transfer between your own accounts — they’re neither spending nor income.',
    'Left out 2 lines that aren’t booked transactions (pending, declined, balances or notes).',
  ])
  assert.equal(doneText({ inserted: 0, duplicates: 0, failed: 0, errors: [], ownTransfers: 0, ignored: 0, range: null }).dated, null)
  assert.equal(SAVE_CHUNK, 500)
})

test('importText: the file, the layout, the preview\'s rows and note', () => {
  assert.equal(reasonText('unsupported currency XYZ'), 'unsupported currency XYZ')
  assert.equal(reasonText('missing/invalid amount'), 'missing/invalid amount')
  assert.equal(fileProblem({ name: 'a.csv', size: 10 }), null)
  assert.match(fileProblem({ name: 'Statement.numbers', size: 10 }), /^Numbers documents can’t be imported directly\./)
  assert.match(fileProblem({ name: 'a.csv', size: 6 * 1024 * 1024 }), /^That file is 6\.0 MB/)
  assert.match(readProblem('errors.unreadable'), /^This spreadsheet couldn’t be read\. Re-export it as CSV/)
  assert.equal(readProblem(undefined), 'This spreadsheet couldn’t be read.')
  assert.match(uploadMore(), /including BNP Paribas Fortis, .*Revolut/)
  assert.equal(detectionText({ remembered: true, confidence: 1 }),
    'Using the columns you confirmed for this layout last time. Check the preview before importing.')
  assert.equal(detectionText({ preset: { name: 'KBC' }, confidence: 0.9 }), 'Recognised: KBC export. Check the preview before importing.')
  assert.match(detectionText({ preset: null, confidence: 0.3 }), /^We couldn’t be sure/)
  assert.match(detectionText({ preset: null, confidence: 0.8 }), /^Columns detected automatically\./)
  assert.equal(mappingUnsure({ confidence: 0.79 }), true)
  assert.equal(mappingUnsure({ confidence: 0.8 }), false)
  assert.deepEqual(DATE_ORDERS, ['dmy', 'mdy', 'ymd'])
  assert.deepEqual(DECIMALS.map((d) => d.value), [',', '.'])
  const row = previewRow({ spent_at: '2026-09-03', kind: 'income', amount_minor: 250000, currency: 'EUR', description: 'ACME' },
    { id: 'pay', name: 'Salary', kind: 'income' })
  assert.equal(row.title, 'ACME')
  assert.match(row.meta, / · Salary$/)
  assert.equal(row.income, true)
  assert.match(row.amount, /^\+/)
  assert.equal(previewRow({ spent_at: '2026-09-03', kind: 'expense', amount_minor: 100, currency: 'EUR', description: null }, null).title, '—')
  assert.equal(previewNote({ ownTransfers: 0, skipped: 0, errors: 0 }, []), null)
  assert.equal(previewNote({ ownTransfers: 1, skipped: 2, errors: 1, firstError: { index: 1, reason: 'missing/invalid date' } }, [5, 7]),
    '1 transfer between your own accounts left out. 2 lines left out (pending, declined, balances or notes). '
    + '1 row can’t be read (e.g. row 7: missing/invalid date).')
})

test('detectStatement + rememberedWith: a confirmed layout wins next time, at most 20 kept', () => {
  const headers = ['Date', 'Amount', 'Description', 'Currency']
  const rows = rowsToObjects(headers, [['2026-09-01', '-1', 'X', 'EUR']])
  const fresh = detectStatement(headers, rows, {})
  assert.equal(fresh.remembered, undefined)
  const confirmed = { ...fresh.mapping, description: '', holderName: 'Jane Doe' }
  const stored = rememberedWith(null, headers, confirmed)
  assert.deepEqual(Object.keys(stored), [headerSignature(headers)])
  assert.equal(stored[headerSignature(headers)].holderName, undefined)
  const again = detectStatement(headers, rows, stored)
  assert.equal(again.remembered, true)
  assert.equal(again.confidence, 1)
  assert.equal(again.mapping.description, undefined)
  // The oldest go once there are 20; storing one again moves it last.
  let many = {}
  for (let i = 0; i < 25; i++) many = rememberedWith(many, [`H${i}`], { date: `H${i}` })
  assert.equal(Object.keys(many).length, 20)
  assert.equal(Object.keys(many)[0], headerSignature(['H5']))
  assert.deepEqual(Object.keys(rememberedWith(many, ['H5'], { date: 'H5' })).slice(-1), [headerSignature(['H5'])])
  assert.deepEqual(rememberedWith(['junk'], headers, {}), { [headerSignature(headers)]: {} })
})

test('readStatement: a table, or the reader\'s message key', () => {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Date', 'Amount'], [new Date(2026, 8, 1), -5]]), 'S')
  const read = readStatement(new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' })))
  assert.deepEqual(read, { ok: true, headers: ['Date', 'Amount'], rows: [['2026-09-01', -5]], lines: [2] })
  const errs = []
  assert.deepEqual(readStatement(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]), (e) => errs.push(e)),
    { ok: false, key: 'errors.unreadable' })
  assert.equal(errs.length, 0, 'the reader\'s own message is not logged')
})
