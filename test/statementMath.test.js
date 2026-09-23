// generate-report's statement maths (supabase/functions/generate-report).
// Node strips the TypeScript types.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildStatement, pendingNote } from '../supabase/functions/generate-report/statementMath.ts'

// my_transactions order: newest first.
const txns = [
  { spent_at: '2026-09-05', kind: 'expense', amount_minor: 1500, currency: 'JPY', exchange_rate: null,
    categories: { name: 'Food' } },
  { spent_at: '2026-09-04', kind: 'expense', amount_minor: 2000, currency: 'GBP', exchange_rate: null,
    description: 'Taxi', categories: { name: 'Travel' } },
  { spent_at: '2026-09-03', kind: 'income', amount_minor: 100000, currency: 'EUR', exchange_rate: 1,
    categories: { name: 'Salary' } },
  { spent_at: '2026-09-02', kind: 'expense', amount_minor: 1000, currency: 'USD', exchange_rate: '0.9',
    categories: { name: 'Travel' } },
  { spent_at: '2026-09-01', kind: 'expense', amount_minor: 450, currency: 'EUR', exchange_rate: null,
    group_expense_id: 'g', group_expenses: { groups: { name: 'Italy' } } },
]

test('pending foreign rows are listed but never summed', () => {
  const s = buildStatement(txns, 'EUR')
  assert.deepEqual(s.rows.map((r) => r.date), ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05'])
  assert.equal(s.totalIncome, 1000)
  assert.equal(s.totalSpent, 9 + 4.5) // USD 10 @ 0.9 + the base-currency share
  assert.deepEqual(s.byCategory, { Travel: 9, Italy: 4.5 })
  const gbp = s.rows.find((r) => r.currency === 'GBP')
  assert.equal(gbp.base_amount, null)
  assert.equal(gbp.amount, 20)
  assert.equal(s.rows.find((r) => r.currency === 'JPY').amount, 1500) // zero-decimal
  assert.deepEqual(s.pending, { count: 2, currencies: ['GBP', 'JPY'] })
})

test('a base-currency row with no rate is simply itself (rate 1), not pending', () => {
  const s = buildStatement([txns[4]], 'EUR')
  assert.equal(s.rows[0].base_amount, 4.5)
  assert.equal(s.pending.count, 0)
})

test('pendingNote', () => {
  assert.equal(pendingNote({ count: 0, currencies: [] }), null)
  assert.equal(pendingNote({ count: 1, currencies: ['GBP'] }),
    '1 transaction in GBP awaits an exchange rate and isn’t in the totals.')
  assert.equal(pendingNote({ count: 3, currencies: ['GBP', 'JPY'] }),
    '3 transactions in GBP, JPY await an exchange rate and aren’t in the totals.')
})
