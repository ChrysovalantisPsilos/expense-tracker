import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ruleSpreadMonths, spreadPart, spreadDates, spendRows, paidInWindow, monthlyShare,
} from '../src/shared/lib/spread.js'

// The JS half of a JS↔SQL pair (0067 spread_part / month_share); the DB suite
// checks the same numbers server-side (test 49).

const parts = (total, n) => Array.from({ length: n }, (_, i) => spreadPart(total, n, i))
const sum = (xs) => xs.reduce((a, b) => a + b, 0)

test('spreadPart: equal integer parts, remainder to the earliest months, exact sum', () => {
  assert.deepEqual(parts(12000, 12), Array(12).fill(1000))
  assert.deepEqual(parts(12005, 12), [1001, 1001, 1001, 1001, 1001, 1000, 1000, 1000, 1000, 1000, 1000, 1000])
  assert.deepEqual(parts(11, 12), [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0])
  for (const total of [0, 1, 7, 9999, 123457, 1000001]) {
    for (const n of [2, 12, 24, 120]) {
      const p = parts(total, n)
      assert.equal(sum(p), total, `${total}/${n}`)
      assert.ok(p.every((x) => Number.isInteger(x)))
      assert.ok(Math.max(...p) - Math.min(...p) <= 1)
    }
  }
  assert.equal(spreadPart(12005, 12, -1), 0)
  assert.equal(spreadPart(12005, 12, 12), 0)
})

test('spreadPart: a 24-month spread (every 2 years)', () => {
  const p = parts(10000, 24) // 416 r 16
  assert.equal(p.filter((x) => x === 417).length, 16)
  assert.deepEqual(p.slice(15, 17), [417, 416])
  assert.equal(sum(p), 10000)
})

test('ruleSpreadMonths: yearly expenses only, 12·N capped at 120', () => {
  assert.equal(ruleSpreadMonths({ frequency: 'yearly', interval_n: 1, kind: 'expense' }), 12)
  assert.equal(ruleSpreadMonths({ frequency: 'yearly', interval_n: 2, kind: 'expense' }), 24)
  assert.equal(ruleSpreadMonths({ frequency: 'yearly', interval_n: 15, kind: 'expense' }), 120)
  assert.equal(ruleSpreadMonths({ frequency: 'yearly', interval_n: 1, kind: 'income' }), null)
  assert.equal(ruleSpreadMonths({ frequency: 'monthly', interval_n: 12, kind: 'expense' }), null)
})

test('spreadDates: same day each month, clamped, across the year end', () => {
  assert.deepEqual(spreadDates('2026-03-15', 12), [
    '2026-03-15', '2026-04-15', '2026-05-15', '2026-06-15', '2026-07-15', '2026-08-15',
    '2026-09-15', '2026-10-15', '2026-11-15', '2026-12-15', '2027-01-15', '2027-02-15',
  ])
  // Clamped from the payment's own day each time (31st restored in March).
  assert.deepEqual(spreadDates('2027-01-31', 3), ['2027-01-31', '2027-02-28', '2027-03-31'])
  assert.deepEqual(spreadDates('2027-12-31', 3), ['2027-12-31', '2028-01-31', '2028-02-29'])
  assert.equal(spreadDates('2026-03-15', 24)[23], '2028-02-15')
})

const base = { kind: 'expense', currency: 'EUR', exchange_rate: 1, categories: { name: 'Insurance' } }
const yearly = { ...base, id: 'y', amount_minor: 12005, spent_at: '2026-03-15', spread_months: 12 }
const plain = { ...base, id: 'p', amount_minor: 500, spent_at: '2026-09-02' }

test('spendRows: a €120.05 charge on 15 Mar counts its part in each month Mar…Feb', () => {
  const month = (m, from, to) => spendRows([yearly], 'EUR', from, to).map((r) => [r.spent_at, r.amount_minor])
  assert.deepEqual(month('Mar', '2026-03-01', '2026-03-31'), [['2026-03-15', 1001]])
  assert.deepEqual(month('Sep', '2026-09-01', '2026-09-30'), [['2026-09-15', 1000]])
  assert.deepEqual(month('Feb', '2027-02-01', '2027-02-28'), [['2027-02-15', 1000]])
  assert.deepEqual(month('Mar next', '2027-03-01', '2027-03-31'), [])
  assert.deepEqual(month('Feb before', '2026-02-01', '2026-02-28'), [])
  // A calendar year sees Mar..Dec; all time sees the whole payment.
  assert.equal(sum(spendRows([yearly], 'EUR', '2026-01-01', '2026-12-31').map((r) => r.amount_minor)), 5 * 1001 + 5 * 1000)
  assert.equal(sum(spendRows([yearly], 'EUR').map((r) => r.amount_minor)), 12005)
})

test('spendRows: parts are in the base currency, split after conversion (zero-decimal too)', () => {
  // ¥13,000 at 0.0062 = €80.60 → 672 × 8 + 671 × 4.
  const yen = { ...yearly, currency: 'JPY', amount_minor: 13000, exchange_rate: 0.0062 }
  const all = spendRows([yen], 'EUR')
  assert.equal(sum(all.map((r) => r.amount_minor)), 8060)
  assert.deepEqual([all[0].amount_minor, all[11].amount_minor], [672, 671])
  assert.ok(all.every((r) => r.currency === 'EUR' && r.exchange_rate === 1))
  // A JPY base keeps whole yen: ¥100,001 over 12.
  const inYen = spendRows([{ ...yearly, currency: 'JPY', amount_minor: 100001 }], 'JPY')
  assert.ok(inYen.every((r) => Number.isInteger(r.amount_minor)))
  assert.equal(sum(inYen.map((r) => r.amount_minor)), 100001)
})

test('spendRows: other rows pass through when paid in the window; income is never spread', () => {
  const income = { ...yearly, id: 'i', kind: 'income' }
  const out = spendRows([yearly, plain, income], 'EUR', '2026-09-01', '2026-09-30')
  assert.deepEqual(out.map((r) => [r.id, r.amount_minor]), [['y', 1000], ['p', 500]])
  assert.deepEqual(paidInWindow([yearly, plain], '2026-09-01', '2026-09-30'), [plain])
  assert.deepEqual(paidInWindow([yearly, plain], null, null), [yearly, plain])
})

test('monthlyShare: per-month cost of spread expenses only', () => {
  assert.deepEqual(monthlyShare({ ...yearly, amount_minor: 12000 }), { perMonth: 1000, months: 12, exact: true })
  assert.deepEqual(monthlyShare({ ...yearly, amount_minor: 1000 }), { perMonth: 84, months: 12, exact: false })
  assert.deepEqual(monthlyShare({ ...yearly, amount_minor: 24000, spread_months: 24 }), { perMonth: 1000, months: 24, exact: true })
  assert.equal(monthlyShare(plain), null)
  assert.equal(monthlyShare({ ...yearly, kind: 'income' }), null)
})

// ---- Keeping yearly subscriptions separate (0068) ----------------------------
import { countsMonthly, ruleCountsMonthly } from '../src/shared/lib/spread.js'

// JS half of public.counts_in_month (DB test 50 checks the same truth table).
test('countsMonthly: only a spread expense is dropped, and only when kept separate', () => {
  assert.equal(countsMonthly(yearly), true)
  assert.equal(countsMonthly(yearly, false), true)
  assert.equal(countsMonthly(yearly, true), false)
  assert.equal(countsMonthly(plain, true), true)
  assert.equal(countsMonthly({ ...yearly, kind: 'income' }, true), true)
  assert.equal(countsMonthly({ ...yearly, spread_months: null }, true), true)
})

test('ruleCountsMonthly: yearly expense rules drop out when kept separate', () => {
  const y = { kind: 'expense', frequency: 'yearly', interval_n: 1 }
  assert.equal(ruleCountsMonthly(y, false), true)
  assert.equal(ruleCountsMonthly(y, true), false)
  assert.equal(ruleCountsMonthly({ ...y, kind: 'income' }, true), true)
  assert.equal(ruleCountsMonthly({ ...y, frequency: 'monthly' }, true), true)
})

test('spendRows: separateYearly leaves spread rows out of every window, plain rows stay', () => {
  const opts = { separateYearly: true }
  assert.deepEqual(spendRows([yearly, plain], 'EUR', '2026-09-01', '2026-09-30', opts).map((r) => r.id), ['p'])
  assert.deepEqual(spendRows([yearly], 'EUR', '2026-03-01', '2026-03-31', opts), [])
  assert.deepEqual(spendRows([yearly, plain], 'EUR', null, null, opts).map((r) => r.id), ['p'])
  // Default: unchanged (spread).
  assert.deepEqual(spendRows([yearly, plain], 'EUR', '2026-09-01', '2026-09-30').map((r) => r.id), ['y', 'p'])
  // The ledger view is untouched: the payment is still listed.
  assert.deepEqual(paidInWindow([yearly, plain], '2026-03-01', '2026-03-31'), [yearly])
})
