import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rowToDraft } from '../src/features/import/importMath.js'

const M = { date: 'D', amount: 'A' }

test('rowToDraft: a clean expense row', () => {
  const d = rowToDraft({ D: '2026-01-15', A: '12.34' }, M, 'EUR')
  assert.equal(d.spent_at, '2026-01-15')
  assert.equal(d.kind, 'expense')
  assert.equal(d.currency, 'EUR')
  assert.equal(d.amount_minor, 1234)
  assert.equal(d.description, null)
})

test('rowToDraft: missing/invalid date and amount are flagged', () => {
  assert.equal(rowToDraft({ A: '5.00' }, M, 'EUR').error, 'missing/invalid date')
  assert.equal(rowToDraft({ D: '2026-01-15', A: '0' }, M, 'EUR').error, 'missing/invalid amount')
})

test('rowToDraft: a Type column, or signed mode\'s positive amount, marks income', () => {
  const m = { ...M, type: 'T' }
  assert.equal(rowToDraft({ D: '2026-01-15', A: '9.99', T: 'income' }, m, 'EUR').kind, 'income')
  assert.equal(rowToDraft({ D: '2026-01-15', A: '9.99', T: 'credit' }, m, 'EUR').kind, 'income')
  assert.equal(rowToDraft({ D: '2026-01-15', A: '9.99', T: 'debit' }, m, 'EUR').kind, 'expense')
  // Signed mode treats a positive amount as income.
  assert.equal(rowToDraft({ D: '2026-01-15', A: '9.99' }, M, 'EUR', { signed: true }).kind, 'income')
  assert.equal(rowToDraft({ D: '2026-01-15', A: '-9.99' }, M, 'EUR', { signed: true }).kind, 'expense')
})

test('rowToDraft: a blank currency cell means base, an unknown one is a row error; zero-decimal currencies stay whole; amount uses abs', () => {
  const m = { ...M, currency: 'C' }
  const d = rowToDraft({ D: '2026-01-15', A: '-4.00', C: ' ' }, m, 'EUR')
  assert.equal(d.currency, 'EUR')
  assert.equal(d.amount_minor, 400)
  // An unknown currency is a row error, never booked as base.
  assert.deepEqual(rowToDraft({ D: '2026-01-15', A: '4.00', C: 'XXX' }, m, 'EUR'),
    { error: 'unsupported currency XXX' })
  // Zero-decimal currencies (JPY, ISK) have no fractional part.
  assert.equal(rowToDraft({ D: '2026-01-15', A: '1800', C: 'jpy' }, m, 'EUR').amount_minor, 1800)
  assert.equal(rowToDraft({ D: '2026-01-15', A: '2500', C: 'ISK' }, m, 'EUR').amount_minor, 2500)
  assert.equal(rowToDraft({ D: '2026-01-15', A: '12.5', C: 'HUF' }, m, 'EUR').amount_minor, 1250)
})
