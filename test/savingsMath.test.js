// The Savings page's pure maths (src/features/savings/savingsMath.js): which
// entries move the pot and which way, a month's flow, the pot month by
// month, the history's month groups and filter, the change chip, goals
// (progress, quick add, pace, ring) and the page's layout. Every rule comes
// from shared/lib/savings.js — these check the page builds on it faithfully.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { savingsPotMinor } from '../src/shared/lib/savings.js'
import { formatMoney } from '../src/shared/lib/currency.js'
import { lastMonths, monthHeading } from '../src/shared/lib/dates.js'
import { MARK_ARCS } from '../src/shared/ui/markGeometry.js'
import {
  touchesSavings, moveDirection, savingsMoves, savingsFlow, potSeries, seriesLength,
  HISTORY_FILTERS, monthGroups, wholeMoney, changeChip,
  goalProgress, goalSavedAfter, goalPace, goalStatus, goalRingArcs, savingsCategoryOf, savingsStacks,
  anchoredSeries, totalSourceNote,
} from '../src/features/savings/savingsMath.js'

const SAV = 'cat-savings'
const IDS = new Set([SAV])
const row = (o) => ({
  kind: 'expense', amount_minor: 1000, currency: 'EUR', exchange_rate: 1, spent_at: '2026-09-10', ...o,
})
const saved = (o) => row({ kind: 'income', category_id: SAV, savings_from_income: true, ...o })

// July: €200 from income. August: €200 from income, £100 interest at 1.2.
// September: €200 from income, a €899 laptop paid from savings, and some
// rows that never touch the pot (salary, groceries).
const rows = [
  saved({ id: 'jul', amount_minor: 20000, spent_at: '2026-07-02', created_at: '2026-07-02T08:00:00Z' }),
  saved({ id: 'aug', amount_minor: 20000, spent_at: '2026-08-02' }),
  saved({ id: 'int', amount_minor: 10000, currency: 'GBP', exchange_rate: 1.2, savings_from_income: false,
    spent_at: '2026-08-28' }),
  saved({ id: 'sep', amount_minor: 20000, spent_at: '2026-09-02', created_at: '2026-09-02T08:00:00Z' }),
  row({ id: 'laptop', amount_minor: 89900, paid_from_savings: true, spent_at: '2026-09-14' }),
  row({ id: 'salary', kind: 'income', category_id: 'cat-salary', amount_minor: 250000, spent_at: '2026-09-01' }),
  row({ id: 'food', category_id: 'cat-food', amount_minor: 4500, spent_at: '2026-09-15' }),
]
const byId = (id) => rows.find((r) => r.id === id)

test('touchesSavings / moveDirection: savings entries go in, expenses paid from savings go out', () => {
  assert.equal(touchesSavings(byId('sep'), IDS), true)
  assert.equal(touchesSavings(byId('int'), IDS), true)
  assert.equal(touchesSavings(byId('laptop'), IDS), true)
  assert.equal(touchesSavings(byId('salary'), IDS), false)
  assert.equal(touchesSavings(byId('food'), IDS), false)
  // Income with no category, or in a category that isn't savings, never counts.
  assert.equal(touchesSavings(row({ kind: 'income', category_id: null }), IDS), false)
  assert.equal(moveDirection(byId('sep'), IDS), 'in')
  assert.equal(moveDirection(byId('int'), IDS), 'in')
  assert.equal(moveDirection(byId('laptop'), IDS), 'out')
  assert.equal(moveDirection(byId('food'), IDS), null)
})

test('savingsMoves: only what moves the pot, newest first, same-day rows by when they were added', () => {
  assert.deepEqual(savingsMoves(rows, IDS).map((r) => r.id), ['laptop', 'sep', 'int', 'aug', 'jul'])
  const a = saved({ id: 'a', spent_at: '2026-09-02', created_at: '2026-09-02T08:00:00Z' })
  const b = saved({ id: 'b', spent_at: '2026-09-02', created_at: '2026-09-02T09:00:00Z' })
  assert.deepEqual(savingsMoves([a, b], IDS).map((r) => r.id), ['b', 'a'])
  assert.deepEqual(savingsMoves([], IDS), [])
})

test('savingsFlow: from income, received and from savings in the base currency, and the net', () => {
  const sep = rows.filter((r) => r.spent_at.startsWith('2026-09'))
  assert.deepEqual(savingsFlow(sep, IDS, 'EUR'), { fromIncome: 20000, received: 0, fromSavings: 89900, net: -69900 })
  const aug = rows.filter((r) => r.spent_at.startsWith('2026-08'))
  // £100 at the captured 1.2 is €120.
  assert.deepEqual(savingsFlow(aug, IDS, 'EUR'), { fromIncome: 20000, received: 12000, fromSavings: 0, net: 32000 })
  assert.deepEqual(savingsFlow([], IDS, 'EUR'), { fromIncome: 0, received: 0, fromSavings: 0, net: 0 })
})

test('savingsFlow: the net over all rows is exactly the shared pot total', () => {
  assert.equal(savingsFlow(rows, IDS, 'EUR').net, savingsPotMinor(rows, IDS, 'EUR'))
})

test('savingsFlow: a zero-decimal base currency gets whole minor units at the captured rate', () => {
  const r = saved({ amount_minor: 1000, currency: 'EUR', exchange_rate: 160.5 }) // €10.00 → ¥1,605
  assert.equal(savingsFlow([r], IDS, 'JPY').fromIncome, 1605)
})

test('potSeries: month-end totals, counting everything before the first month in', () => {
  const now = new Date(2026, 8, 20)
  const months = lastMonths(2, now) // Aug, Sep: July's €200 is already in the pot
  const series = potSeries(rows, IDS, 'EUR', months)
  assert.deepEqual(series.map((s) => [s.key, s.net, s.pot]), [['2026-08', 32000, 52000], ['2026-09', -69900, -17900]])
  assert.equal(series[1].fromSavings, 89900)
  assert.equal(series[1].label, 'Sep')
  // The last point is the all-time pot.
  assert.equal(series.at(-1).pot, savingsPotMinor(rows, IDS, 'EUR'))
})

test('potSeries: rows after the last month are left out', () => {
  const series = potSeries([...rows, saved({ amount_minor: 5, spent_at: '2026-10-01' })], IDS, 'EUR',
    lastMonths(2, new Date(2026, 8, 20)))
  assert.equal(series.at(-1).pot, -17900)
})

test('seriesLength: from the oldest move to now, between 2 and max months', () => {
  const now = new Date(2026, 8, 20)
  assert.equal(seriesLength(savingsMoves(rows, IDS), now), 3) // Jul, Aug, Sep
  assert.equal(seriesLength([saved({ spent_at: '2026-09-01' })], now), 2) // a line needs two points
  assert.equal(seriesLength([saved({ spent_at: '2024-01-01' })], now), 12)
  assert.equal(seriesLength([saved({ spent_at: '2024-01-01' })], now, 6), 6)
  assert.equal(seriesLength([], now), 0)
})

test('monthGroups: newest month first, each with its whole net, whatever the filter', () => {
  const moves = savingsMoves(rows, IDS)
  assert.deepEqual(HISTORY_FILTERS.map(([v]) => v), ['all', 'in', 'out'])
  const all = monthGroups(moves, IDS, 'EUR')
  assert.deepEqual(all.map((g) => [g.key, g.rows.map((r) => r.id), g.net]), [
    ['2026-09', ['laptop', 'sep'], -69900],
    ['2026-08', ['int', 'aug'], 32000],
    ['2026-07', ['jul'], 20000],
  ])
  const out = monthGroups(moves, IDS, 'EUR', 'out')
  assert.deepEqual(out.map((g) => [g.key, g.rows.map((r) => r.id), g.net]), [['2026-09', ['laptop'], -69900]])
  const into = monthGroups(moves, IDS, 'EUR', 'in')
  assert.deepEqual(into.map((g) => [g.key, g.rows.map((r) => r.id)]), [
    ['2026-09', ['sep']], ['2026-08', ['int', 'aug']], ['2026-07', ['jul']],
  ])
  assert.deepEqual(monthGroups([], IDS, 'EUR'), [])
})

test('monthHeading: the month, with its year outside the current one', () => {
  const now = new Date(2026, 8, 20)
  assert.equal(monthHeading('2026-09', now), 'September')
  assert.equal(monthHeading('2025-12', now), 'December 2025')
})

test('wholeMoney drops a zero fraction only', () => {
  assert.equal(wholeMoney(89900, 'EUR'), formatMoney(89900, 'EUR').replace(/[.,]00(?=\D*$)/, ''))
  assert.equal(wholeMoney(70940, 'EUR'), formatMoney(70940, 'EUR'))
  assert.equal(wholeMoney(1605, 'JPY'), formatMoney(1605, 'JPY'))
  assert.doesNotMatch(wholeMoney(20000, 'EUR'), /[.,]\d\d$/)
})

test('changeChip: green only when the pot grew; otherwise what was spent from it, never a loss', () => {
  assert.deepEqual(changeChip({ fromSavings: 0, net: 70940 }), { kind: 'up', minor: 70940 })
  assert.deepEqual(changeChip({ fromSavings: 89900, net: -69900 }), { kind: 'spent', minor: 89900 })
  // Grew despite a spend: the growth wins.
  assert.deepEqual(changeChip({ fromSavings: 100, net: 500 }), { kind: 'up', minor: 500 })
  // Put in exactly what came out: neutral, says what was spent.
  assert.deepEqual(changeChip({ fromSavings: 500, net: 0 }), { kind: 'spent', minor: 500 })
  assert.deepEqual(changeChip({ fromSavings: 0, net: 0 }), { kind: 'none', minor: 0 })
})

test('goalProgress: percent, reached flag and a tenth-of-target step', () => {
  assert.deepEqual(goalProgress({ saved_minor: 2500, target_minor: 10000 }), { pct: 25, done: false, step: 1000 })
  assert.deepEqual(goalProgress({ saved_minor: 12000, target_minor: 10000 }), { pct: 100, done: true, step: 1000 })
  assert.deepEqual(goalProgress({ saved_minor: 1, target_minor: 3 }), { pct: 33, done: false, step: 1 })
  // No target: nothing reached, no divide-by-zero.
  assert.deepEqual(goalProgress({ saved_minor: 500, target_minor: 0 }), { pct: 0, done: false, step: 1 })
})

test('goalSavedAfter never goes below zero', () => {
  assert.equal(goalSavedAfter({ saved_minor: 500 }, 1000), 1500)
  assert.equal(goalSavedAfter({ saved_minor: 500 }, -1000), 0)
})

test('goalPace: the rest over the months left, rounded up; null without a date, once reached or past', () => {
  const now = new Date(2026, 8, 26)
  const japan = { saved_minor: 120000, target_minor: 250000, target_date: '2027-05-01' }
  // Sep 2026 → May 2027: 8 months for €1,300.
  assert.deepEqual(goalPace(japan, now), { perMonth: 16250, by: 'May 2027' })
  assert.equal(goalPace({ saved_minor: 0, target_minor: 1000, target_date: '2026-12-31' }, now).perMonth, 334)
  // Due later this month: all of it now.
  assert.equal(goalPace({ saved_minor: 0, target_minor: 1000, target_date: '2026-09-30' }, now).perMonth, 1000)
  assert.equal(goalPace({ saved_minor: 0, target_minor: 1000, target_date: null }, now), null)
  assert.equal(goalPace({ saved_minor: 1000, target_minor: 1000, target_date: '2027-01-01' }, now), null)
  assert.equal(goalPace({ saved_minor: 0, target_minor: 1000, target_date: '2026-09-25' }, now), null)
})

test('goalStatus: reached, the pace to its date, or a muted no-deadline / date-passed line', () => {
  const now = new Date(2026, 8, 26)
  assert.deepEqual(goalStatus({ saved_minor: 5000, target_minor: 5000, currency: 'EUR' }, now),
    { text: 'Reached 🎉', strong: true })
  const pace = goalStatus({ saved_minor: 120000, target_minor: 250000, currency: 'EUR', target_date: '2027-05-01' }, now)
  assert.equal(pace.text, `${wholeMoney(16250, 'EUR')}/mo to reach it by May 2027`)
  assert.equal(pace.strong, true)
  assert.deepEqual(goalStatus({ saved_minor: 0, target_minor: 5000, currency: 'EUR' }, now),
    { text: 'No deadline', strong: false })
  assert.deepEqual(goalStatus({ saved_minor: 0, target_minor: 5000, currency: 'EUR', target_date: '2026-01-01' }, now),
    { text: 'Target date passed', strong: false })
})

test('goalRingArcs: amber first, then the gap, then coral — a reached goal is the whole mark', () => {
  const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`)
  assert.deepEqual(goalRingArcs(0), { amber: [0, 0], coral: [MARK_ARCS.coral[0], 0] })
  const ten = goalRingArcs(10)
  close(ten.amber[1], 0.1); assert.equal(ten.coral[1], 0)
  // Inside the gap: amber is full, coral hasn't started.
  const gap = goalRingArcs(29)
  close(gap.amber[1], MARK_ARCS.amber[1]); assert.equal(gap.coral[1], 0)
  const sixty = goalRingArcs(60)
  close(sixty.coral[1], 0.6 - MARK_ARCS.coral[0])
  const full = goalRingArcs(100)
  close(full.amber[0] + full.amber[1], MARK_ARCS.amber[1])
  close(full.coral[0] + full.coral[1], MARK_ARCS.coral[1])
  assert.deepEqual(goalRingArcs(250), full)
  assert.deepEqual(goalRingArcs(-5), goalRingArcs(0))
})

test('savingsCategoryOf: the first active income savings category, else null', () => {
  assert.equal(savingsCategoryOf([
    { id: 'old', kind: 'income', is_savings: true, is_archived: true },
    { id: 'sal', kind: 'income', is_savings: false },
    { id: 'sav', kind: 'income', is_savings: true, is_archived: false },
  ]), 'sav')
  assert.equal(savingsCategoryOf([{ id: 'x', kind: 'expense', is_savings: true }]), null)
  assert.equal(savingsCategoryOf([]), null)
  assert.equal(savingsCategoryOf(undefined), null)
})

test('savingsStacks: every card once, the pot a strip when sideways', () => {
  const cards = (s) => [...s.strip, ...s.left, ...s.right].sort()
  const upright = savingsStacks()
  const sideways = savingsStacks({ sideways: true })
  assert.deepEqual(cards(upright), ['goals', 'history', 'month', 'pot'])
  assert.deepEqual(cards(sideways), cards(upright))
  assert.deepEqual(upright.left, ['pot', 'month'])
  assert.deepEqual(sideways.strip, ['pot'])
})

test('totalSourceNote: says where the Savings total comes from', () => {
  assert.equal(totalSourceNote('accounts'), 'From your savings accounts')
  assert.equal(totalSourceNote('entries'), 'From your savings entries')
})

test('anchoredSeries: from savings accounts, the line ends on their total; from entries, unchanged', () => {
  const series = [
    { key: '2026-07', label: 'Jul', pot: 10000 },
    { key: '2026-08', label: 'Aug', pot: 25000 },
    { key: '2026-09', label: 'Sep', pot: 42000 },
  ]
  assert.equal(anchoredSeries(series, { source: 'entries', minor: 42000 }), series)
  const moved = anchoredSeries(series, { source: 'accounts', minor: 1021300 })
  assert.deepEqual(moved.map((s) => s.pot), [1021300 - 32000, 1021300 - 17000, 1021300])
  assert.deepEqual(moved.map((s) => s.label), ['Jul', 'Aug', 'Sep'])
  assert.deepEqual(series.map((s) => s.pot), [10000, 25000, 42000]) // not mutated
  assert.deepEqual(anchoredSeries([], { source: 'accounts', minor: 5 }), [])
})
