import { test } from 'node:test'
import assert from 'node:assert/strict'
import { payCalendar } from '../src/shared/lib/payCalendar.js'
import { NET_SHARE, netRate,
  INFLATION, INFLATION_LATEST, inflationRate, defaultCountry, splitPay, payLevels, raiseKind, averageRaise,
  yearTotals, priceRise, sinceChoices, vsInflation, indexationRate, extraRatios, project, projections,
  salaryReport, normaliseNotes, withFix, bonusCategoryId, monthsBetween, payChartRows, payChartAxis, offMonths,
} from '../src/features/salary/salaryMath.js'

const SAL = 'cat-salary'
const BON = 'cat-bonus'
let n = 0
const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
const pay = (date, euros, extra = {}) => ({
  id: id(), kind: 'income', category_id: SAL, amount_minor: Math.round(euros * 100), currency: 'EUR',
  exchange_rate: 1, spent_at: date, description: 'Salary', ...extra,
})
const opts = (extra = {}) => ({ salaryId: SAL, bonusId: BON, currency: 'EUR', ...extra })
// Monthly pay on the 25th from `from` ('YYYY-MM') for `count` months at `euros`.
function monthly(from, count, euros) {
  const [y, m] = from.split('-').map(Number)
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 + i, 25))
    return pay(d.toISOString().slice(0, 10), typeof euros === 'function' ? euros(i) : euros)
  })
}

test('inflation table: real Eurostat figures, a fallback for a year without one', () => {
  assert.equal(INFLATION.BE[2022], 10.3)
  assert.equal(INFLATION.GR[2022], 9.3)
  assert.equal(INFLATION.BE[2025], 3.0)
  assert.equal(INFLATION.GR[2025], 2.9)
  for (const c of ['BE', 'GR']) for (let y = 2015; y <= 2025; y++) assert.equal(typeof INFLATION[c][y], 'number', `${c} ${y}`)
  assert.equal(inflationRate('BE', 2026), INFLATION_LATEST.BE.rate)
  assert.equal(inflationRate('GR', 2027), INFLATION_LATEST.GR.rate)
})

test('the prices country: picked, else the voucher country, else the language', () => {
  assert.equal(defaultCountry({ picked: 'GR', voucherCountry: 'BE', language: 'en' }), 'GR')
  assert.equal(defaultCountry({ voucherCountry: 'GR', language: 'en' }), 'GR')
  assert.equal(defaultCountry({ language: 'el' }), 'GR')
  assert.equal(defaultCountry({ language: 'en' }), 'BE')
  assert.equal(defaultCountry({ picked: 'FR', voucherCountry: 'XX', language: 'en' }), 'BE')
})

test('no salary entries, or no salary category: nothing to show', () => {
  assert.equal(salaryReport([], { ...opts(), nowKey: '2026-09' }), null)
  assert.equal(salaryReport(monthly('2026-01', 3, 2000), { ...opts(), salaryId: null, nowKey: '2026-09' }), null)
  // A bonus alone isn't a salary history.
  assert.equal(salaryReport([pay('2026-03-10', 500, { category_id: BON })], { ...opts(), nowKey: '2026-09' }), null)
  // Other income (and expenses) are ignored.
  const other = [pay('2026-03-10', 500, { category_id: 'cat-gift' }), pay('2026-03-10', 50, { kind: 'expense' })]
  assert.equal(salaryReport(other, { ...opts(), nowKey: '2026-09' }), null)
})

test('one month only: the pay, no raise, no average yet', () => {
  const r = salaryReport([pay('2026-09-25', 2500)], { ...opts(), nowKey: '2026-09' })
  assert.equal(r.level, 250000)
  assert.equal(r.paidMonths, 1)
  assert.deepEqual(r.raises, [])
  assert.equal(r.lastRaise, null)
  assert.equal(r.since, null)
  assert.equal(r.average, null)
  assert.deepEqual(r.years, [{ year: 2026, regular: 250000, extras: 0, months: 1, total: 250000 }])
})

test('raises: a lasting change of 1% or more; a one-month blip is ignored; the latest month counts', () => {
  const rows = monthly('2024-01', 30, (i) => {
    if (i === 5) return 2300 // a one-month blip (Jun 2024)
    if (i >= 29) return 2200 // the latest month (Jun 2026): a raise
    if (i >= 12) return 2100 // Jan 2025 on
    return 2000
  })
  const r = salaryReport(rows, { ...opts(), nowKey: '2026-09' })
  assert.deepEqual(r.raises.map((x) => [x.key, x.from, x.to]), [['2025-01', 200000, 210000], ['2026-06', 210000, 220000]])
  assert.equal(r.steps.find((s) => s.key === '2024-06').level, 200000)
  assert.deepEqual(payLevels(r.months).raises, r.raises)
  assert.equal(r.lastRaise.key, '2026-06')
  assert.equal(r.since, 3)
  // A change under 1% isn't a raise.
  const small = salaryReport(monthly('2025-01', 6, (i) => (i >= 3 ? 2015 : 2000)), { ...opts(), nowKey: '2025-06' })
  assert.deepEqual(small.raises, [])
})

test('a pay cut is a change too (and never the "last raise")', () => {
  const r = salaryReport(monthly('2025-01', 6, (i) => (i >= 3 ? 1800 : 2000)), { ...opts(), nowKey: '2025-06' })
  assert.equal(r.raises.length, 1)
  assert.ok(r.raises[0].pct < 0)
  assert.equal(r.lastRaise, null)
  assert.equal(raiseKind(r.raises[0], 'BE'), 'cut')
})

test('a month without pay keeps the level and makes no raise', () => {
  const rows = monthly('2025-01', 6, 2000).filter((_, i) => i !== 2)
  const r = salaryReport(rows, { ...opts(), nowKey: '2025-06' })
  assert.deepEqual(r.months.map((m) => m.regular), [200000, 200000, 0, 200000, 200000, 200000])
  assert.deepEqual(r.raises, [])
  assert.equal(r.steps.length, 6)
  assert.equal(r.paidMonths, 5)
  assert.equal(r.years[0].months, 5)
})

test('raise kinds: Belgian January indexation up to last year\'s inflation + 1 point', () => {
  const at = (key, pct) => ({ key, pct, from: 100, to: 100 * (1 + pct) })
  assert.equal(raiseKind(at('2026-01', 0.035), 'BE'), 'indexation') // 2025: 3.0% (+1 → 4.0)
  assert.equal(raiseKind(at('2026-01', 0.041), 'BE'), 'raise')
  assert.equal(raiseKind(at('2023-01', 0.11), 'BE'), 'indexation') // 2022: 10.3%
  assert.equal(raiseKind(at('2026-03', 0.02), 'BE'), 'raise')
  assert.equal(raiseKind(at('2026-01', 0.02), 'GR'), 'raise')
  assert.equal(raiseKind(at('2026-01', -0.02), 'GR'), 'cut')
})

test('extras: a second payment ≥ 10% is guessed from its month; a smaller one is pay', () => {
  const rows = [
    ...monthly('2025-01', 12, 2000),
    pay('2025-06-15', 1900), // holiday pay
    pay('2025-12-18', 2000), // 13th month
    pay('2025-03-20', 400), // a bonus (March)
    pay('2025-04-10', 150), // under 10%: part of April's pay
  ]
  const { months, extras } = splitPay(rows, opts())
  assert.deepEqual(extras.map((e) => [e.key, e.kind, e.minor, e.guess]).sort(),
    [['2025-03', 'bonus', 40000, true], ['2025-06', 'holiday', 190000, true], ['2025-12', 'thirteenth', 200000, true]])
  assert.equal(months.find((m) => m.key === '2025-04').regular, 215000)
  assert.ok(months.every((m) => m.key === '2025-04' || m.regular === 200000))
})

test('one payment holding the extra in May/June/December is split', () => {
  const rows = [...monthly('2025-01', 4, 2000), pay('2025-05-25', 3900), ...monthly('2025-06', 3, 2000), pay('2025-09-25', 3900)]
  const { months, extras } = splitPay(rows, opts())
  assert.equal(months.find((m) => m.key === '2025-05').regular, 200000)
  assert.deepEqual(extras.map((e) => [e.key, e.kind, e.minor, e.inPay, e.guess]), [['2025-05', 'holiday', 190000, true, true]])
  // September isn't an extras month: the big payment is the pay (a blip, not a raise).
  assert.equal(months.find((m) => m.key === '2025-09').regular, 390000)
  const r = salaryReport(rows, { ...opts(), nowKey: '2025-12' })
  assert.equal(r.raises.length, 1) // the latest month counts as a change until the next shows otherwise
})

test('the Bonus category: always a bonus, never a guess', () => {
  const rows = [...monthly('2025-01', 6, 2000), pay('2025-06-20', 800, { category_id: BON, description: 'Q2' })]
  const { extras, months } = splitPay(rows, opts())
  assert.deepEqual(extras.map((e) => [e.kind, e.minor, e.guess, e.description]), [['bonus', 80000, false, 'Q2']])
  assert.ok(months.every((m) => m.regular === 200000))
  // Without a Bonus category those entries are just other income.
  assert.equal(splitPay(rows, opts({ bonusId: null })).extras.length, 0)
})

test('corrections win: "not an extra", another kind, a split payment keeps its split', () => {
  const rows = [...monthly('2025-01', 12, 2000)]
  const overtime = pay('2025-09-12', 600, { description: 'Overtime' })
  const june = pay('2025-06-12', 1800)
  const may = pay('2025-05-10', 700, { category_id: BON })
  const decLump = rows.find((r) => r.spent_at === '2025-12-25')
  decLump.amount_minor = 400000
  rows.push(overtime, june, may)
  const fixes = { [overtime.id]: 'regular', [june.id]: 'bonus', [decLump.id]: 'holiday', [may.id]: 'regular' }
  const { months, extras, regularFixed } = splitPay(rows, opts({ fixes }))
  assert.equal(months.find((m) => m.key === '2025-09').regular, 260000)
  assert.equal(months.find((m) => m.key === '2025-05').regular, 270000)
  assert.deepEqual(regularFixed.map((x) => x.id).sort(), [overtime.id, may.id].sort())
  const byId = new Map(extras.map((e) => [e.id, e]))
  assert.deepEqual([byId.get(june.id).kind, byId.get(june.id).guess, byId.get(june.id).fixed], ['bonus', false, true])
  const dec = byId.get(decLump.id)
  assert.deepEqual([dec.kind, dec.minor, dec.inPay, dec.fixed, dec.guess], ['holiday', 200000, true, true, false])
  assert.equal(months.find((m) => m.key === '2025-12').regular, 200000)
})

test('pay months: every payment counts in its pay month, and the guess reads that month', () => {
  const rows = [pay('2025-12-28', 2000), pay('2026-01-27', 2000), pay('2026-02-26', 2100), pay('2026-03-27', 2100)]
  const cal = payCalendar({ fromDay: 25, categoryId: SAL }, rows.map((r) => r.spent_at), '2026-04-10')
  const { months } = splitPay(rows, opts({ cal }))
  assert.deepEqual(months.map((m) => m.key), ['2026-01', '2026-02', '2026-03', '2026-04'])
  const r = salaryReport(rows, { ...opts(), cal, nowKey: '2026-04' })
  assert.deepEqual(r.raises.map((x) => x.key), ['2026-03'])
  // Off: the same payments count where they were paid.
  assert.deepEqual(splitPay(rows, opts()).months.map((m) => m.key), ['2025-12', '2026-01', '2026-02', '2026-03'])
  // A 13th month paid on 28 Nov with December's salary is December's.
  const nov = [pay('2025-10-28', 2000), pay('2025-11-28', 2000), pay('2025-11-28', 2000, { id: 'thirteenth' })]
  const decCal = payCalendar({ fromDay: 25, categoryId: SAL }, ['2025-10-28', '2025-11-28'], '2025-12-10')
  assert.deepEqual(splitPay(nov, opts({ cal: decCal })).extras.map((e) => [e.key, e.kind]), [['2025-12', 'thirteenth']])
  assert.deepEqual(splitPay(nov, opts()).extras.map((e) => [e.key, e.kind]), [['2025-11', 'bonus']])
})

test('entries in another currency count at their captured rate', () => {
  const rows = [pay('2025-01-25', 2000), pay('2025-02-25', 2000, { currency: 'USD', amount_minor: 220000, exchange_rate: 0.9090909 })]
  const { months } = splitPay(rows, opts())
  assert.equal(months[1].regular, 200000)
})

test('average raise: compound growth a year; null under a year', () => {
  assert.equal(averageRaise([{ key: '2025-01', level: 100 }]), null)
  assert.equal(averageRaise([{ key: '2025-01', level: 100 }, { key: '2025-12', level: 110 }]), null)
  const a = averageRaise([{ key: '2024-01', level: 200000 }, { key: '2026-01', level: 220500 }])
  assert.ok(Math.abs(a - 0.05) < 1e-9)
})

test('year totals: regular, extras and total per year', () => {
  const months = [{ key: '2025-11', regular: 200000 }, { key: '2025-12', regular: 200000 }, { key: '2026-01', regular: 210000 }, { key: '2026-02', regular: 0 }]
  const extras = [{ key: '2025-12', minor: 200000 }, { key: '2026-01', minor: 5000 }]
  assert.deepEqual(yearTotals(months, extras), [
    { year: 2025, regular: 400000, extras: 200000, months: 2, total: 600000 },
    { year: 2026, regular: 210000, extras: 5000, months: 1, total: 215000 },
  ])
})

test('prices: each year\'s inflation for its months, compounded', () => {
  assert.ok(Math.abs(priceRise('BE', '2024-01', '2025-01') - 0.043) < 1e-9)
  assert.ok(Math.abs(priceRise('BE', '2023-01', '2025-01') - (1.023 * 1.043 - 1)) < 1e-9)
  assert.ok(Math.abs(priceRise('GR', '2025-07', '2026-01') - (1.029 ** 0.5 - 1)) < 1e-9)
  assert.equal(priceRise('BE', '2025-03', '2025-03'), 0)
  // This year: the latest 12-month rate for the months gone by.
  assert.ok(Math.abs(priceRise('BE', '2026-01', '2026-07') - ((1 + INFLATION_LATEST.BE.rate / 100) ** 0.5 - 1)) < 1e-9)
})

test('pay against prices since a year: the change, the real change and the monthly gap', () => {
  const steps = [{ key: '2024-01', level: 200000 }, { key: '2024-06', level: 200000 }, { key: '2025-01', level: 212000 }]
  const v = vsInflation(steps, 'BE', 2024)
  assert.equal(v.fromKey, '2024-01')
  assert.ok(Math.abs(v.pay - 0.06) < 1e-9)
  assert.ok(Math.abs(v.prices - 0.043) < 1e-9)
  assert.ok(Math.abs(v.real - (1.06 / 1.043 - 1)) < 1e-9)
  assert.equal(v.gap, 212000 - 208600)
  const behind = vsInflation([{ key: '2022-01', level: 200000 }, { key: '2023-01', level: 204000 }], 'BE', 2022)
  assert.ok(behind.gap < 0 && behind.real < 0)
  assert.equal(vsInflation([{ key: '2026-01', level: 1 }], 'BE', 2026), null)
})

test('since which year: years with pay and figures, the latest left out, the last four', () => {
  const steps = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => ({ key: `${from + i}-01`, level: 1 }))
  assert.deepEqual(sinceChoices(steps(2012, 2026)), [2022, 2023, 2024, 2025])
  assert.deepEqual(sinceChoices(steps(2024, 2026)), [2024, 2025])
  assert.deepEqual(sinceChoices(steps(2026, 2026)), [2026])
})

test('indexation only: the average of the last three full years', () => {
  assert.ok(Math.abs(indexationRate('BE', '2026-09') - (2.3 + 4.3 + 3.0) / 300) < 1e-12)
  assert.ok(Math.abs(indexationRate('GR', '2026-09') - (4.2 + 3.0 + 2.9) / 300) < 1e-12)
})

test('projections: a raise every January, holiday pay and the 13th month at their ratios, no bonuses', () => {
  const ratios = { holiday: { ratio: 0.9, month: 6 }, thirteenth: { ratio: 1, month: 12 } }
  const p = project({ level: 300000, rate: 0.02, years: 1, nowKey: '2026-09', ratios })
  assert.equal(p.monthly, 306000)
  assert.equal(p.regular, 3 * 300000 + 9 * 306000)
  assert.equal(p.extras, 300000 + Math.round(306000 * 0.9))
  assert.equal(p.total, p.regular + p.extras)
  assert.equal(p.series.length, 13)
  assert.equal(p.series[0].key, '2026-09')
  const flat = project({ level: 100000, rate: 0, years: 10, nowKey: '2026-09' })
  assert.equal(flat.total, 120 * 100000)
})

test('the three ways ahead; my trend needs a year of pay', () => {
  const rows = monthly('2024-01', 33, (i) => (i >= 24 ? 2205 : i >= 12 ? 2100 : 2000))
  const report = salaryReport(rows, { ...opts(), nowKey: '2026-09' })
  const ways = projections(report, { country: 'BE', years: 5, whatIf: 3, nowKey: '2026-09' })
  assert.deepEqual(ways.map((w) => w.id), ['trend', 'index', 'whatIf'])
  assert.ok(Math.abs(ways[0].rate - report.average) < 1e-12)
  assert.equal(ways[2].gross, 0.03)
  assert.equal(ways[2].rate, 0.015) // the slider is a gross raise: half reaches net pay in Belgium
  assert.ok(ways[0].total > ways[1].total)
  const young = salaryReport(monthly('2026-03', 6, 2000), { ...opts(), nowKey: '2026-09' })
  assert.deepEqual(projections(young, { country: 'GR', years: 1, whatIf: 0, nowKey: '2026-09' }).map((w) => w.id), ['index', 'whatIf'])
})

test('extra ratios: the latest year of each, only while it is still paid', () => {
  const steps = [{ key: '2025-06', level: 200000 }, { key: '2025-12', level: 200000 }, { key: '2026-06', level: 210000 }]
  const extras = [
    { kind: 'holiday', key: '2025-06', minor: 180000 }, { kind: 'holiday', key: '2026-06', minor: 189000 },
    { kind: 'thirteenth', key: '2025-12', minor: 200000 }, { kind: 'bonus', key: '2026-06', minor: 50000 },
  ]
  assert.deepEqual(extraRatios(extras, steps, '2026-09'), { holiday: { ratio: 0.9, month: 6 }, thirteenth: { ratio: 1, month: 12 } })
  assert.deepEqual(extraRatios(extras, steps, '2028-01'), {})
})

test('corrections document: normalised, one fix per entry, stale ones dropped', () => {
  const a = '7d9f3a52-2c1e-4b8a-9f00-1a2b3c4d5e6f'
  const b = '0e1f2a3b-4c5d-4e6f-8a7b-9c0d1e2f3a4b'
  assert.deepEqual(normaliseNotes(null), { v: 1, fixes: {} })
  assert.deepEqual(normaliseNotes({ v: 1, fixes: { [a]: 'holiday', nope: 'bonus', [b]: 'salary' }, country: 'FR', bonus_category_id: 'x' }),
    { v: 1, fixes: { [a]: 'holiday' } })
  const kept = normaliseNotes({ fixes: {}, country: 'GR', bonus_category_id: b })
  assert.deepEqual(kept, { v: 1, fixes: {}, bonus_category_id: b, country: 'GR' })
  const next = withFix({ v: 1, fixes: { [a]: 'holiday', [b]: 'bonus' } }, a, 'regular', [a])
  assert.deepEqual(next.fixes, { [a]: 'regular' })
})

test('the Bonus category: picked, else the default one', () => {
  const cats = [
    { id: 'x', kind: 'income', default_key: 'bonus', is_archived: true },
    { id: 'y', kind: 'income', default_key: 'bonus' },
    { id: 'z', kind: 'income' }, { id: 'e', kind: 'expense' },
  ]
  assert.equal(bonusCategoryId(cats, null), 'y')
  assert.equal(bonusCategoryId(cats, { bonus_category_id: 'z' }), 'z')
  assert.equal(bonusCategoryId(cats, { bonus_category_id: 'e' }), 'y')
  assert.equal(bonusCategoryId([{ id: 'z', kind: 'income' }], {}), null)
  assert.equal(monthsBetween('2025-11', '2026-02'), 3)
})

test('the pay chart: a dot for each month with pay, a hollow one off the level', () => {
  // A year at 2,428.79, August a one-month dip, April without pay, a June
  // holiday allowance on top.
  const rows = monthly('2025-10', 12, (i) => (i === 10 ? 2316.4 : 2428.79)).filter((_, i) => i !== 6)
  rows.push(pay('2026-06-05', 2200, { description: 'Holiday allowance' }))
  const r = salaryReport(rows, { ...opts(), nowKey: '2026-09' })
  assert.equal(r.lastRaise, null) // the dip is no raise (and no cut)
  assert.deepEqual(r.raises, [])
  const chart = payChartRows(r)
  assert.equal(chart.length, 12)
  assert.ok(chart.every((m) => m.level === 242879))
  const aug = chart.find((m) => m.key === '2026-08')
  assert.deepEqual([aug.pay, aug.off], [231640, true])
  const apr = chart.find((m) => m.key === '2026-04')
  assert.deepEqual([apr.pay, apr.off], [null, false])
  assert.equal(chart.filter((m) => m.off).length, 1)
  const jun = chart.find((m) => m.key === '2026-06')
  assert.deepEqual([jun.pay, jun.holiday, jun.off], [242879, 220000, false])
  // The axis reaches the lowest dot, not only the level.
  assert.deepEqual(payChartAxis(chart), { domain: [2200, 2500], ticks: [2200, 2300, 2400, 2500] })
  assert.deepEqual(offMonths(chart), { months: [{ key: '2026-08', pay: 231640, level: 242879 }], more: 0 })
})

test('the pay chart: off by 1% or more only; the latest few off months, and how many more', () => {
  // Under 1% above in April; a dip in Jun, Aug, Oct and Dec (Jan after is back).
  const pays = (i) => (i === 3 ? 2019 : i % 2 && i > 4 ? 1900 : 2000)
  const chart = payChartRows(salaryReport(monthly('2025-01', 13, pays), { ...opts(), nowKey: '2026-01' }))
  assert.equal(chart.find((m) => m.key === '2025-04').off, false)
  assert.deepEqual(chart.filter((m) => m.off).map((m) => m.key), ['2025-06', '2025-08', '2025-10', '2025-12'])
  assert.deepEqual(offMonths(chart, 2), {
    months: [{ key: '2025-10', pay: 190000, level: 200000 }, { key: '2025-12', pay: 190000, level: 200000 }], more: 2,
  })
  // No pay off the level: nothing to list, and the low is the level's.
  const flat = payChartRows(salaryReport(monthly('2025-01', 3, 2000), { ...opts(), nowKey: '2025-03' }))
  assert.deepEqual(offMonths(flat), { months: [], more: 0 })
  assert.deepEqual(payChartAxis(flat), { domain: [1900, 2100], ticks: [1900, 2000, 2100] })
})

test('the pay chart axis: round steps around every dot, labels that never repeat', () => {
  const row = (level, pay = level) => ({ level, pay })
  // Years of raises: 2,180 → 2,792.40, on steps of 200.
  assert.deepEqual(payChartAxis([row(218000), row(279240)]), { domain: [2000, 3000], ticks: [2000, 2200, 2400, 2600, 2800, 3000] })
  // A dot below the level widens it; a month without pay has no dot.
  const dip = payChartAxis([row(300000), row(300000, 240000), row(300000, null)])
  assert.ok(dip.domain[0] <= 2400 && dip.domain[1] >= 3000)
  // A zero-decimal currency (factor 1): yen, in thousands.
  const yen = payChartAxis([row(300000), row(300000, 280000)], 1)
  assert.ok(yen.domain[0] <= 280000 && yen.domain[1] >= 300000)
  // Never closer than a tenth of the top's power of ten ("2.3k", "2.4k"), and
  // at most a handful of ticks.
  for (const a of [payChartAxis([row(242879, 242000)]), yen, dip]) {
    const labels = a.ticks.map((v) => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(v))
    assert.equal(new Set(labels).size, labels.length, labels.join(' '))
    assert.ok(a.ticks.length >= 3 && a.ticks.length <= 7, labels.join(' '))
  }
})

test('gross raises reach net pay at the country net share; the own trend is already net', () => {
  assert.equal(netRate(0.032, 'BE'), 0.016)
  assert.equal(Math.round(netRate(0.1, 'GR') * 1000) / 1000, 0.055)
  assert.equal(netRate(0.1, 'XX'), 0.05) // unknown country: the default share
  const report = { level: 250000, ratios: {}, average: 0.04 }
  const ways = projections(report, { country: 'BE', years: 1, whatIf: 10, nowKey: '2026-09' })
  const by = Object.fromEntries(ways.map((w) => [w.id, w]))
  assert.equal(by.trend.gross, null)
  assert.equal(by.trend.rate, 0.04)
  assert.equal(by.whatIf.gross, 0.1)
  assert.equal(by.whatIf.rate, 0.05)
  assert.equal(by.whatIf.monthly, 262500) // +5% net in January, not +10%
  assert.equal(by.index.rate, by.index.gross * NET_SHARE.BE)
})
