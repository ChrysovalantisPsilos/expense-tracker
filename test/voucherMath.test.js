import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  westernEaster, orthodoxEaster, publicHolidays, workingDays, addMonths, daysFor, topUpsSince, nextTopUp,
  voucherSummary, voucherHistory, newSettings, withDays, normaliseSettings, firstTopUpDate,
} from '../src/features/vouchers/voucherMath.js'

const day = (d) => d.toISOString().slice(0, 10)

test('Easter: western and orthodox', () => {
  assert.equal(day(westernEaster(2024)), '2024-03-31')
  assert.equal(day(westernEaster(2025)), '2025-04-20')
  assert.equal(day(westernEaster(2026)), '2026-04-05')
  assert.equal(day(orthodoxEaster(2024)), '2024-05-05')
  assert.equal(day(orthodoxEaster(2025)), '2025-04-20')
  assert.equal(day(orthodoxEaster(2026)), '2026-04-12')
})

test('public holidays: Belgium and Greece', () => {
  const be = publicHolidays('BE', 2026)
  assert.equal(be.size, 10)
  for (const d of ['2026-01-01', '2026-04-06', '2026-05-01', '2026-05-14', '2026-05-25', '2026-07-21',
    '2026-08-15', '2026-11-01', '2026-11-11', '2026-12-25']) assert.ok(be.has(d), d)
  const gr = publicHolidays('GR', 2026)
  assert.equal(gr.size, 12)
  for (const d of ['2026-01-01', '2026-01-06', '2026-02-23', '2026-03-25', '2026-04-10', '2026-04-13',
    '2026-05-01', '2026-06-01', '2026-08-15', '2026-10-28', '2026-12-25', '2026-12-26']) assert.ok(gr.has(d), d)
})

test('working days: Mon–Fri minus the holidays', () => {
  assert.equal(workingDays('BE', '2026-09'), 22)
  assert.equal(workingDays('BE', '2026-08'), 21) // 15 Aug is a Saturday
  assert.equal(workingDays('BE', '2026-11'), 20) // 11 Nov (Wed); 1 Nov is a Sunday
  assert.equal(workingDays('BE', '2026-05'), 18) // 1, 14 and 25 May
  assert.equal(workingDays('GR', '2026-10'), 21) // 28 Oct (Wed)
  assert.equal(workingDays('GR', '2026-04'), 20) // Good Friday and Easter Monday
  assert.equal(workingDays('BE', '2026-04'), 21) // Easter Monday
  assert.equal(addMonths('2026-12', 1), '2027-01')
  assert.equal(addMonths('2026-01', -1), '2025-12')
})

const S = {
  v: 1, country: 'BE', per_day_minor: 800, currency: 'EUR', topup_day: 5,
  start_on: '2026-08-20', start_balance_minor: 3450, days: {},
}
const spend = (spent_at, amount_minor, extra = {}) =>
  ({ kind: 'expense', paid_with_vouchers: true, spent_at, amount_minor, currency: 'EUR', exchange_rate: 1, ...extra })

test('top-ups: after setup, on the chosen day, for last month', () => {
  assert.deepEqual(topUpsSince(S, '2026-09-04'), [])
  const [sep] = topUpsSince(S, '2026-09-05')
  assert.deepEqual(sep, { on: '2026-09-05', month: '2026-08', days: 21, auto: 21, fixed: false, amount_minor: 16800 })
  // Set up on the top-up day itself: that day's top-up is already on the card.
  assert.deepEqual(topUpsSince({ ...S, start_on: '2026-09-05' }, '2026-09-30'), [])
  assert.deepEqual(nextTopUp(S, '2026-09-28'), {
    on: '2026-10-05', month: '2026-09', days: 22, auto: 22, fixed: false, amount_minor: 17600,
  })
  assert.equal(nextTopUp(S, '2026-10-04').on, '2026-10-05')
  assert.equal(nextTopUp(S, '2026-10-05').on, '2026-11-05')
  assert.equal(nextTopUp(S, '2026-12-28').on, '2027-01-05')
})

test('fixed days replace the calendar; the calendar count removes the fix', () => {
  const fixed = withDays(S, '2026-09', 20)
  assert.deepEqual(fixed.days, { '2026-09': 20 })
  assert.deepEqual(daysFor(fixed, '2026-09'), { days: 20, auto: 22, fixed: true })
  assert.equal(nextTopUp(fixed, '2026-09-28').amount_minor, 16000)
  assert.deepEqual(withDays(fixed, '2026-09', 22).days, {})
  assert.deepEqual(withDays(fixed, '2026-09', 0).days, { '2026-09': 0 })
})

test('what is on the card: start + top-ups − voucher spending', () => {
  const rows = [
    spend('2026-09-26', 4230), spend('2026-09-24', 1180), spend('2026-09-18', 1865),
    spend('2026-09-12', 5610), spend('2026-09-03', 790),
    spend('2026-08-19', 999), // before setup: already reflected in the starting balance
    { kind: 'expense', paid_with_vouchers: false, spent_at: '2026-09-10', amount_minor: 5000, currency: 'EUR' },
    { kind: 'income', spent_at: '2026-09-01', amount_minor: 300000, currency: 'EUR' },
  ]
  assert.deepEqual(voucherSummary(S, rows, '2026-09-28'), { balance: 3450 + 16800 - 13675, monthTopUps: 16800, monthSpent: 13675 })
  // A foreign-currency lunch counts at its captured rate.
  const gbp = spend('2026-09-27', 1000, { currency: 'GBP', exchange_rate: 1.15 })
  assert.equal(voucherSummary(S, [gbp], '2026-09-28').balance, 3450 + 16800 - 1150)
})

test('history: by month, newest first, the start last', () => {
  const rows = [spend('2026-09-05', 790), spend('2026-08-25', 500)]
  const h = voucherHistory(S, rows, '2026-09-28')
  assert.deepEqual(h.map((g) => [g.month, g.net]), [['2026-09', 16800 - 790], ['2026-08', -500]])
  assert.deepEqual(h[0].items.map((i) => i.type), ['spend', 'topup'])
  assert.deepEqual(h[1].items.map((i) => [i.type, i.minor]), [['spend', -500], ['start', 3450]])
})

test('saving the setup starts again from today and keeps the fixes still ahead', () => {
  const prev = { ...S, days: { '2026-06': 18, '2026-09': 20 } }
  const next = newSettings({ country: 'GR', per_day_minor: 1000, currency: 'EUR', topup_day: 1, balance_minor: 5000 }, prev, '2026-10-02')
  assert.deepEqual(next, {
    v: 1, country: 'GR', per_day_minor: 1000, currency: 'EUR', topup_day: 1,
    start_on: '2026-10-02', start_balance_minor: 5000, days: { '2026-09': 20 },
  })
})

test('a setup from a backup: kept when it has the server\'s shape', () => {
  assert.deepEqual(normaliseSettings(S), S)
  assert.deepEqual(normaliseSettings({ ...S, extra: 1, days: { '2026-09': 20, '2026-13': 3, x: 1, '2026-08': 40 } }),
    { ...S, days: { '2026-09': 20 } })
  for (const bad of [null, [], 'x', { ...S, country: 'FR' }, { ...S, per_day_minor: 0 }, { ...S, per_day_minor: 8.5 },
    { ...S, currency: 'eur' }, { ...S, topup_day: 32 }, { ...S, topup_day: 0 }, { ...S, start_on: '2026-02-30' }, { ...S, start_balance_minor: -1 }]) {
    assert.equal(normaliseSettings(bad), null, JSON.stringify(bad))
  }
})

test('a top-up day past a month\'s end lands on its last day', () => {
  const late = { ...S, topup_day: 31, start_on: '2026-01-15' }
  assert.deepEqual(topUpsSince(late, '2026-04-30').map((x) => x.on), ['2026-04-30', '2026-03-31', '2026-02-28', '2026-01-31'])
  assert.equal(nextTopUp(late, '2026-09-29').on, '2026-09-30')
  assert.equal(nextTopUp(late, '2026-09-30').on, '2026-10-31')
  assert.equal(normaliseSettings(late).topup_day, 31)
})

test('the setup form\'s top-up date: the next top-up, or the 1st of next month', () => {
  assert.equal(firstTopUpDate(S, '2026-09-29'), '2026-10-05')
  assert.equal(firstTopUpDate(null, '2026-12-10'), '2027-01-01')
})
