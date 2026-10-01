// "Your salary" as the page and the card show it (src/features/salary/
// salaryText.js): the headline, the pay chart's rows, ticks and words, the
// raises, the years, the extras by year, the projections and the prices.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { salaryReport, bonusCandidates, salaryEntryIds } from '../src/features/salary/salaryMath.js'
import {
  pctText, monthLabel, payHeadline, payChartParts, yearTicks, raisesParts, yearsParts, extrasParts, extrasWindow,
  fixChoices, bonusChoices, projectionParts, inflationParts, salaryCardParts, RAISE_ROWS, EXTRAS_YEARS,
} from '../src/features/salary/salaryText.js'
import { setLanguage } from '../mobile-core/index.js'

const SAL = 'cat-salary'
const BON = 'cat-bonus'
let n = 0
const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
const pay = (date, euros, extra = {}) => ({
  id: id(), kind: 'income', category_id: SAL, amount_minor: Math.round(euros * 100), currency: 'EUR',
  exchange_rate: 1, spent_at: date, description: 'Salary', ...extra,
})
function monthly(from, count, euros) {
  const [y, m] = from.split('-').map(Number)
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 + i, 25))
    return pay(d.toISOString().slice(0, 10), typeof euros === 'function' ? euros(i) : euros)
  })
}
const report = (rows, nowKey = '2026-09') =>
  salaryReport(rows, { salaryId: SAL, bonusId: BON, currency: 'EUR', notes: null, shift: null, nowKey })

// Two years at €2,000, a raise to €2,100 in January 2026, holiday pay in June 2025.
const HISTORY = [
  ...monthly('2024-10', 15, 2000),
  ...monthly('2026-01', 9, 2100),
  pay('2025-06-10', 1800, { description: 'Holiday pay' }),
  pay('2025-12-15', 500, { category_id: BON, description: 'Year-end bonus' }),
]

test('rates and months as the page writes them', () => {
  assert.equal(pctText(0.032), '+3.2%')
  assert.equal(pctText(-0.015), '−1.5%')
  assert.equal(pctText(0.02, false), '2.0%')
  assert.equal(monthLabel('2026-01'), 'Jan 2026')
})

test('the headline: the regular pay and the last raise', () => {
  const r = report(HISTORY)
  assert.deepEqual(payHeadline(r, 'EUR'), { level: '€2,100.00', raise: '+5.0% in Jan 2026' })
  assert.equal(payHeadline(report(monthly('2026-08', 2, 2000)), 'EUR').raise, null)
  assert.deepEqual(salaryCardParts(r, 'EUR').steps.slice(-2), [210000, 210000])
  assert.equal(salaryCardParts(null, 'EUR'), null)
})

test('the pay chart: rows in major units, a tick a year, the axis worded, the chart in words', () => {
  const parts = payChartParts(report(HISTORY), 'EUR')
  assert.equal(parts.rows.length, 24)
  assert.deepEqual(parts.rows[0], { key: '2024-10', off: false, level: 2000, pay: 2000, holiday: 0, thirteenth: 0, bonus: 0 })
  assert.deepEqual(parts.ticks.map((tick) => tick.label), ['2024', '2025', '2026'])
  assert.equal(parts.hasExtras, true)
  assert.equal(parts.hasOff, false)
  assert.equal(parts.axis.labels.length, parts.axis.ticks.length)
  assert.match(parts.axis.labels[0], /k$/)
  assert.match(parts.aria, /^Your pay each month from Oct 2024 to Sep 2026/)
  // Past eight Januaries, every other year.
  const keys = Array.from({ length: 10 }, (_, i) => `${2015 + i}-01`)
  assert.deepEqual(yearTicks(keys), keys.filter((_, i) => i % 2 === 0))
})

test('raises: since, the average, newest first, and Show all past five', () => {
  const r = report(HISTORY)
  const parts = raisesParts(r, 'EUR', 'GR')
  assert.equal(parts.since, '8 months')
  assert.equal(parts.average.tone, 'positive')
  assert.equal(parts.average.note, null)
  assert.deepEqual(parts.rows.map((x) => [x.title, x.amount, x.up]), [['Raise', '+5.0%', true]])
  assert.equal(parts.rows[0].meta, 'Jan 2026 · €2,000.00 → €2,100.00')
  assert.equal(parts.all, null)
  const steps = Array.from({ length: RAISE_ROWS + 2 }, (_, i) => monthly(`20${20 + i}-01`, 12, 2000 + i * 100)).flat()
  assert.equal(raisesParts(report(steps, '2026-12'), 'EUR', 'GR').all, 'Show all (6)')
  const young = raisesParts(report(monthly('2026-07', 2, 2000)), 'EUR', 'BE')
  assert.deepEqual([young.since, young.average.text, young.average.tone], ['—', '—', 'muted'])
  assert.equal(young.average.note, 'After a year of pay')
})

test('years, newest first: this year so far', () => {
  const rows = yearsParts(report(HISTORY), 'EUR', '2026-09')
  assert.deepEqual(rows.map((y) => y.title), ['2026 so far', '2025', '2024'])
  assert.equal(rows[1].meta, 'Regular €24,000 · extras €2,300')
  assert.equal(rows[1].amount, '€26,300')
})

test('extras by year: totals, lines, guesses, corrections, the window', () => {
  const years = extrasParts(report(HISTORY), 'EUR', new Date('2025-12-20T12:00:00Z'))
  assert.deepEqual(years.map((y) => [y.year, y.total]), [[2025, '€2,300.00']])
  const [bonus, holiday] = years[0].rows
  assert.deepEqual([bonus.title, bonus.guess, bonus.meta], ['Bonus', false, '15 Dec · Year-end bonus'])
  assert.deepEqual([holiday.title, holiday.guess, holiday.amount], ['Holiday pay', true, '€1,800.00'])
  assert.equal(holiday.fixLabel, 'Fix Holiday pay of 10 Jun')
  assert.deepEqual(extrasWindow(5), { shown: EXTRAS_YEARS, more: true, next: EXTRAS_YEARS * 2 })
  assert.deepEqual(extrasWindow(3, 4), { shown: 3, more: false, next: 6 })
  assert.deepEqual(fixChoices().map((c) => c.value), ['holiday', 'thirteenth', 'bonus', 'regular'])
})

test('the Bonus picker: active income categories but the salary, named', () => {
  const cats = [
    { id: SAL, kind: 'income', name: 'Salary', default_key: 'salary' },
    { id: 'a', kind: 'income', name: 'Side job' },
    { id: 'b', kind: 'income', name: 'Old', is_archived: true },
    { id: 'c', kind: 'expense', name: 'Food' },
  ]
  assert.deepEqual(bonusCandidates(cats, SAL).map((c) => c.id), ['a'])
  assert.deepEqual(bonusChoices(cats, SAL), [{ id: 'a', label: 'Side job' }])
  assert.deepEqual(salaryEntryIds([{ id: 1, category_id: SAL }, { id: 2, category_id: 'x' }, { id: 3, category_id: BON }], SAL, BON), [1, 3])
})

test('if things go on: the horizons, each way worded, the series and the axis', () => {
  const parts = projectionParts(report(HISTORY), { country: 'BE', years: 3, whatIf: 2, nowKey: '2026-09', currency: 'EUR' })
  assert.deepEqual(parts.horizons.map((h) => h.label), ['1 year', '3 years', '5 years', '10 years'])
  assert.deepEqual(parts.ways.map((w) => w.id), ['trend', 'index', 'whatIf'])
  assert.match(parts.ways[1].title, /^Indexation only · ≈ \+\d\.\d% net$/)
  assert.match(parts.ways[2].meta, /^\+2\.0% gross · €[\d,]+ a month by Sep 2029$/)
  assert.equal(parts.ways[0].series.length, 37)
  assert.equal(parts.ways[0].series[0].value, 2100)
  assert.deepEqual(parts.ticks.map((tick) => tick.label), ['2027', '2028', '2029'])
  assert.equal(parts.slider.value, '2.0%')
  assert.equal(parts.total, 'Earned in 3 years')
  assert.equal(parts.trendLater, null)
  assert.equal(parts.axis.labels.length, parts.axis.ticks.length)
})

test('against prices: the years, the tiles, the gap, or why not', () => {
  const r = report(HISTORY)
  const parts = inflationParts(r, 'BE', null, 'EUR')
  assert.deepEqual(parts.countries.map((c) => c.label), ['Belgium', 'Greece'])
  assert.deepEqual(parts.choices.map((c) => c.value), [2024, 2025])
  assert.equal(parts.from, 2024)
  assert.match(parts.headline, /^Since Oct 2024: your pay \+5\.0%, prices \+/)
  assert.deepEqual(parts.tiles.map((tile) => tile.key), ['pay', 'prices', 'real'])
  assert.match(parts.gap, /<b>€[\d,]+ a month<\/b>/)
  assert.equal(parts.empty, null)
  assert.match(parts.info, /Belgium/)
  assert.equal(inflationParts(r, 'BE', 2025, 'EUR').from, 2025)
  const one = inflationParts(report(monthly('2026-09', 1, 2000)), 'GR', null, 'EUR')
  assert.deepEqual([one.empty, one.headline, one.gap], ['Needs pay from more than one month.', null, null])
})

test('the words follow the app\'s language', () => {
  setLanguage('el')
  try {
    assert.equal(raisesParts(report(HISTORY), 'EUR', 'GR').since, '8 μήνες')
  } finally {
    setLanguage('en')
  }
})
