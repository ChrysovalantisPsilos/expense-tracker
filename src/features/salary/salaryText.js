// "Your salary" as the page and Insights' card show it (pure: no React, no
// I/O; tested in test/salaryText.test.js): every figure and word the cards
// lay out, worked out once for the website's components and the native app
// alike. The maths is salaryMath.js; this turns its answers into the page's
// lines, in the app's language.
import { formatMoney, formatRoundedMoney, minorFactor } from '../../shared/lib/currency.js'
import { shortDate, shortMonth } from '../../shared/lib/dates.js'
import { intlLocale, t } from '../../shared/lib/i18n/i18n.js'
import { categoryDisplayName } from '../../shared/lib/categoryName.js'
import { axisTick } from '../../shared/ui/chartAxis.js'
import {
  COUNTRIES, FIX_KINDS, HORIZONS, INFLATION_FROM, WHAT_IF, bonusCandidates, monthNum, offMonths,
  payChartAxis, payChartRows, projections, raiseKind, sinceChoices, vsInflation, yearOf,
} from './salaryMath.js'

// ── Formatting ──────────────────────────────────────────────────────────────
// A rate as "+3.2%" (signed: a true minus for a fall) or "3.2%".
export function pctText(x, signed = true) {
  const s = new Intl.NumberFormat(intlLocale('en-GB'), {
    style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1,
  }).format(Math.abs(x))
  if (!signed) return s
  return `${x < 0 ? '−' : '+'}${s}`
}
export const monthLabel = (key) => `${shortMonth(monthNum(key) - 1)} ${yearOf(key)}`
export const money = (minor, currency) => formatMoney(minor, currency)
export const rounded = (minor, currency) => formatRoundedMoney(minor, currency)

// ── The headline ────────────────────────────────────────────────────────────
// The regular pay a month, and the chip under it: "+3.2% in Jan 2026" (null:
// "No raise yet").
export function payHeadline(report, currency) {
  const raise = report.lastRaise
  return {
    level: money(report.level, currency),
    raise: raise ? t('salary:lastRaise', { pct: pctText(raise.pct), month: monthLabel(raise.key) }) : null,
  }
}

// ── The pay chart ───────────────────────────────────────────────────────────
// The chart's text alternative: the span, and the months off the regular pay.
export function payChartAria(rows, currency) {
  const base = t('salary:chart.aria', { from: monthLabel(rows[0].key), to: monthLabel(rows[rows.length - 1].key) })
  const { months, more } = offMonths(rows)
  if (!months.length) return base
  const list = months.map((m) => t('salary:chart.offItem', {
    month: monthLabel(m.key), pay: money(m.pay, currency), level: money(m.level, currency),
  })).join('; ')
  return [base, t('salary:chart.offAria', { list }), more ? t('salary:chart.offMore', { count: more }) : ''].filter(Boolean).join(' ')
}

// The year ticks under a monthly chart: January (or the first month), every
// other year (or more) past `most` of them.
export function yearTicks(keys, most = 8, first = true) {
  const januaries = keys.filter((k, i) => (first && i === 0) || monthNum(k) === 1)
  const every = Math.ceil(januaries.length / most)
  return januaries.filter((_, i) => i % every === 0)
}

// A value axis in major units with its labels ("2.3k").
const axisParts = (axis) => ({ ...axis, labels: axis.ticks.map(axisTick) })

// The pay chart: one row a month in major units (the level, the month's pay
// or null, `off`, the extras), the year ticks, the value axis, whether
// there are extras or months off the level, and the chart in words.
export function payChartParts(report, currency) {
  const f = minorFactor(currency)
  const rows = payChartRows(report)
  const data = rows.map((r) => ({
    key: r.key, off: r.off, level: r.level / f, pay: r.pay == null ? null : r.pay / f,
    holiday: r.holiday / f, thirteenth: r.thirteenth / f, bonus: r.bonus / f,
  }))
  return {
    rows: data,
    ticks: yearTicks(data.map((d) => d.key)).map((key) => ({ key, label: String(yearOf(key)) })),
    axis: axisParts(payChartAxis(rows, f)),
    hasExtras: data.some((d) => d.holiday || d.thirteenth || d.bonus),
    hasOff: data.some((d) => d.off),
    aria: payChartAria(rows, currency),
  }
}

// ── Raises ──────────────────────────────────────────────────────────────────
// How many raises show before "Show all".
export const RAISE_ROWS = 5

// The Raises card: since the last raise, the average a year (its tone, and
// "After a year of pay" while there's none), and each change newest first:
// its kind, "Jan 2026 · €2,705.00 → €2,792.00" and the rate.
export function raisesParts(report, currency, country) {
  const list = [...report.raises].reverse()
  return {
    since: report.since == null ? '—' : t('salary:raises.since', { count: report.since }),
    average: {
      text: report.average == null ? '—' : pctText(report.average),
      tone: report.average == null ? 'muted' : report.average >= 0 ? 'positive' : 'negative',
      note: report.average == null ? t('salary:raises.averageLater') : null,
    },
    rows: list.map((r) => ({
      key: r.key,
      up: r.pct > 0,
      title: t(`salary:raises.${raiseKind(r, country)}`),
      meta: t('salary:raises.fromTo', { month: monthLabel(r.key), from: money(r.from, currency), to: money(r.to, currency) }),
      amount: pctText(r.pct),
    })),
    all: list.length > RAISE_ROWS ? t('salary:raises.all', { count: list.length }) : null,
  }
}

// ── Year by year ────────────────────────────────────────────────────────────
// Newest first: "2026 so far" for this year, regular and extras, the total.
export function yearsParts(report, currency, nowKey) {
  const nowYear = yearOf(nowKey)
  return [...report.years].reverse().map((y) => ({
    year: y.year,
    title: y.year === nowYear ? t('salary:years.soFar', { year: y.year }) : String(y.year),
    meta: t('salary:years.split', { regular: rounded(y.regular, currency), extras: rounded(y.extras, currency) }),
    amount: rounded(y.total, currency),
  }))
}

// ── Extras ──────────────────────────────────────────────────────────────────
// Years of extras shown at first, and how many more each "Show older" adds.
export const EXTRAS_YEARS = 2

// The Extras card by year, newest first: each year's extras total (what the
// user counted as pay is listed, as "Not an extra", but not added) and its
// rows, newest first: the kind, the date with "inside that month's pay" or
// the entry's description, Guessed / You set this, the amount (muted for
// pay), and the Fix button's label. Dates are worded as of `now`.
export function extrasParts(report, currency, now = new Date()) {
  const items = [...report.extras, ...report.regularFixed.map((r) => ({ ...r, kind: 'regular', fixed: true }))]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  const years = new Map()
  for (const e of items) {
    const y = yearOf(e.key)
    if (!years.has(y)) years.set(y, [])
    years.get(y).push(e)
  }
  return [...years.entries()].map(([year, list]) => ({
    year,
    total: money(list.filter((e) => e.kind !== 'regular').reduce((s, e) => s + e.minor, 0), currency),
    rows: list.map((e) => {
      const kind = t(`salary:extras.${e.kind}`)
      return {
        id: e.id,
        key: `${e.id}:${e.kind}`,
        kind: e.kind,
        title: kind,
        meta: [shortDate(e.date, now), e.inPay ? t('salary:extras.inPay') : e.description].filter(Boolean).join(' · '),
        guess: !!e.guess,
        fixed: !!e.fixed,
        amount: money(e.minor, currency),
        regular: e.kind === 'regular',
        fixLabel: t('salary:extras.fixLabel', { kind, date: shortDate(e.date, now) }),
      }
    }),
  }))
}

// How many years of extras show (the first EXTRAS_YEARS until "Show older";
// null asks for those), whether there are older ones, and how many "Show
// older" asks for.
export function extrasWindow(count, shown = null) {
  const asked = shown ?? EXTRAS_YEARS
  return { shown: Math.min(count, asked), more: count > asked, next: asked + EXTRAS_YEARS }
}

// What a payment can be corrected to: [{ value, label }].
export const fixChoices = () => FIX_KINDS.map((k) => ({ value: k, label: t(`salary:extras.${k}`) }))

// The Bonus picker's categories: the income ones that aren't the salary's
// (salaryMath.bonusCandidates), with their names: [{ id, label }].
export const bonusChoices = (categories, salaryId) =>
  bonusCandidates(categories, salaryId).map((c) => ({ id: c.id, label: categoryDisplayName(c) }))

// ── If things go on ─────────────────────────────────────────────────────────
// The projection card for `years` ahead and the slider's `whatIf` (% a
// year): the horizons, each way's line (its title, "+3.2% gross · €3,100 a
// month by Sep 2031", what it adds up to) and its monthly pay in major
// units, the year ticks and value axis over every way, the slider's value,
// the total's heading, and "My trend shows after a year of pay" until then.
export function projectionParts(report, { country, years, whatIf, nowKey, currency }) {
  const f = minorFactor(currency)
  const ways = projections(report, { country, years, whatIf, nowKey })
  const keys = ways[0].series.map((p) => p.key)
  return {
    horizons: HORIZONS.map((n) => ({ value: n, label: t('salary:projection.years', { count: n }) })),
    ways: ways.map((w) => ({
      id: w.id,
      title: t(w.gross == null ? 'salary:projection.way' : 'salary:projection.wayNet', {
        way: t(`salary:projection.${w.id}`), pct: pctText(w.rate),
      }),
      meta: [
        w.gross != null && t('salary:projection.gross', { pct: pctText(w.gross) }),
        t('salary:projection.monthlyIn', { amount: rounded(w.monthly, currency), month: monthLabel(w.series[w.series.length - 1].key) }),
      ].filter(Boolean).join(' · '),
      total: rounded(w.total, currency),
      series: w.series.map((p) => ({ key: p.key, value: p.pay / f })),
    })),
    ticks: yearTicks(keys, 6, false).map((key) => ({ key, label: String(yearOf(key)) })),
    // The pay chart's axis rule (round steps, labels that never repeat), over every way's pay.
    axis: axisParts(payChartAxis(ways.flatMap((w) => w.series.map((p) => ({ level: p.pay, pay: null }))), f)),
    slider: { ...WHAT_IF, value: pctText(whatIf / 100, false) },
    total: t('salary:projection.total', { count: years }),
    trendLater: report.average == null ? t('salary:projection.trendLater') : null,
  }
}

// ── Against prices ──────────────────────────────────────────────────────────
// The prices card for `country` from the year picked (`picked`, else the
// first choice): the countries, the years it can start in, the year shown,
// then the headline, the three tiles and the monthly gap (its <b> marks the
// amount), or why there's nothing to compare; and the ⓘ's words.
export function inflationParts(report, country, picked, currency) {
  const choices = sinceChoices(report.steps)
  const from = choices.includes(picked) ? picked : choices[0] ?? null
  const v = from == null ? null : vsInflation(report.steps, country, from)
  return {
    countries: COUNTRIES.map((c) => ({ value: c, label: t(`salary:inflation.${c}`) })),
    choices: choices.map((y) => ({ value: y, label: String(y) })),
    from,
    empty: v ? null : from == null ? t('salary:inflation.tooOld', { year: INFLATION_FROM }) : t('salary:inflation.needMore'),
    headline: v ? t('salary:inflation.headline', { month: monthLabel(v.fromKey), pay: pctText(v.pay), prices: pctText(v.prices) }) : null,
    tiles: v ? [
      { key: 'pay', label: t('salary:inflation.pay'), text: pctText(v.pay), tone: 'default' },
      { key: 'prices', label: t('salary:inflation.prices'), text: pctText(v.prices), tone: 'default' },
      { key: 'real', label: t('salary:inflation.real'), text: pctText(v.real), tone: v.real >= 0 ? 'positive' : 'negative' },
    ] : [],
    gap: v ? t(v.gap >= 0 ? 'salary:inflation.ahead' : 'salary:inflation.behind', { amount: rounded(Math.abs(v.gap), currency) }) : null,
    info: t('salary:inflation.info', { month: v ? monthLabel(v.fromKey) : '', country: t(`salary:inflation.${country}`) }),
  }
}

// ── Insights' card ──────────────────────────────────────────────────────────
// The headline and the small step line of the regular pay (each level), or
// null before there's any salary entry.
export function salaryCardParts(report, currency) {
  if (!report) return null
  return { ...payHeadline(report, currency), steps: report.steps.map((s) => s.level) }
}
