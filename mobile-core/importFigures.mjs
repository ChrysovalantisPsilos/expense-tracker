// The statement import as the web's functions work it out, for the native
// app's parity fixture (as screenFigures.mjs is for the other screens):
//   npm run ios:fixture   →  ios/Budgeer/BudgeerTests/Fixtures/import.json
// One fake bank export (semicolons, decimal commas, day-first dates, two
// identical lines, a row the ledger already holds, a row that can't be read)
// read, detected, previewed, imported with a review choice and summed up,
// step for step as ImportModel takes them, in English and in Greek. The
// Swift test (ImportParityTests) runs the same file through the app and
// must get the same words, rows and ids; test/iosImport.test.js keeps the
// committed file equal to what the web gives today.
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readStatement } from '../src/features/import/sheetRead.js'
import { rowsToObjects } from '../src/features/import/sheetParse.js'
import { detectStatement } from '../src/features/import/statementDetect.js'
import { dropKnownRows, merchantGroups, suggestedHolder } from '../src/features/import/importMath.js'
import { applyReview, importSummary, statementPreview, statementRows } from '../src/features/import/statementRows.js'
import { detectionText, doneText, previewNote, previewRow } from '../src/features/import/importText.js'
import { t } from '../src/shared/lib/i18n/i18n.js'
import { setLanguage } from './index.js'
import { FIXTURES_DIR } from './screenFigures.mjs'

const cat = (id, name, kind, extra = {}) => ({ id, name, kind, icon: null, color: null, is_archived: false, ...extra })
const GROCERIES = cat('33333333-3333-4333-8333-333333333333', 'Groceries', 'expense', { default_key: 'groceries' })
const EATING = cat('44444444-4444-4444-8444-444444444444', 'Eating out', 'expense', { color: 'teal' })
const PAY = cat('11111111-1111-4111-8111-111111111111', 'Salary', 'income', { default_key: 'salary' })

export const IMPORT_INPUT = {
  now: '2026-09-15T10:00:00.000Z',
  userId: '99999999-9999-4999-8999-999999999999',
  name: 'statement.csv',
  csv: [
    'Date;Description;Amount;Currency',
    '01/09/2026;LIDL LEUVEN 1234;-23,40;EUR',
    '02/09/2026;CAFE ROMA;-4,50;EUR',
    '02/09/2026;CAFE ROMA;-4,50;EUR',
    '03/09/2026;ACME PAYROLL;2.500,00;EUR',
    '04/09/2026;CARD PAYMENT TAXI;;EUR',
    '',
  ].join('\n'),
  profile: { base_currency: 'EUR', display_name: 'Sam Morgan', ai_import_categories: false },
  categories: [EATING, GROCERIES, PAY],
  rules: [{ id: 'r1', pattern: 'LIDL', category_id: GROCERIES.id, created_at: '2026-08-01T09:00:00.000Z' }],
  // What the ledger holds over the file's days: one of the two coffees.
  existing: [{ id: 't1', kind: 'expense', spent_at: '2026-09-02', amount_minor: 450, currency: 'EUR', description: 'Cafe Roma' }],
  // The review's choice: the coffees are Eating out, the payroll left blank.
  assign: { 'expense|CAFE ROMA': EATING.id },
}

// One language's walk through the import.
function importFigures(lang) {
  setLanguage(lang)
  const input = IMPORT_INPUT
  const now = new Date(input.now)
  const base = input.profile.base_currency
  const table = readStatement(new TextEncoder().encode(input.csv))
  const rows = rowsToObjects(table.headers, table.rows)
  const detection = detectStatement(table.headers, rows, {})
  const mapping = { ...detection.mapping, holderName: suggestedHolder('', input.profile.display_name) }
  const preview = statementPreview(rows, mapping, base, { categories: input.categories, rules: input.rules })
  const byId = new Map(input.categories.map((c) => [c.id, c]))
  const built = statementRows({
    rows, mapping, userId: input.userId, baseCurrency: base, categories: input.categories, rules: input.rules,
    lines: table.lines,
  })
  const groups = merchantGroups(built.valid, built.merchants)
  const review = applyReview(built.valid, built.merchants, groups, input.assign)
  const dropped = dropKnownRows(review.rows, input.existing)
  const summary = importSummary({ inserted: dropped.rows.length, duplicates: dropped.known },
    { errors: built.errors, skipped: built.skipped, rows: review.rows })
  return {
    headers: table.headers,
    rowsLabel: t('import:map.rows', { count: rows.length }),
    detection: detectionText(detection),
    ready: preview.ready,
    preview: preview.rows.map((d) => previewRow(d, byId.get(d.category_id) ?? null, now)),
    note: previewNote(preview, table.lines),
    merchants: groups.map((g) => ({
      id: g.id, pattern: g.pattern, kind: g.kind,
      meta: `${t('import:map.rows', { count: g.count })} · ${t(g.kind === 'income' ? 'import:review.moneyIn' : 'import:review.moneyOut')}`,
    })),
    rules: review.rules,
    saved: dropped.rows,
    done: doneText(summary, now),
  }
}

export function importFixture() {
  const expected = { en: importFigures('en'), el: importFigures('el') }
  setLanguage('en')
  return { input: IMPORT_INPUT, expected }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const root = fileURLToPath(new URL('..', import.meta.url))
  await writeFile(resolve(root, FIXTURES_DIR, 'import.json'), JSON.stringify(importFixture(), null, 2) + '\n')
  console.log(`import fixture: ${FIXTURES_DIR}/import.json`)
}
