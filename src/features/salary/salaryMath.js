// Salary history and projections (pure, no I/O): each month's regular pay
// from the salary entries, the raises, the extras (holiday pay, 13th month,
// bonus), the pay against prices, and where the pay goes if things go on.
//
// Entries are income rows in the salary category (net pay, what reaches the
// bank; planMath.salaryCategoryId) and the Bonus category. Money is in minor
// units of the base currency (toBaseMinor at each entry's captured rate).
// Months are 'YYYY-MM' keys; a salary paid late in the month counts for the
// next one when the salary shift is on (shared/lib/salaryShift.js).
//
// The user's corrections are one document per account (0102,
// my_salary_history), kept as `notes`:
//   { v: 1, fixes: { '<entry id>': 'regular' | 'holiday' | 'thirteenth' |
//     'bonus' }, bonus_category_id?: id | null, country?: 'BE' | 'GR' }
import { toBaseMinor } from '../../shared/lib/currency.js'
import { countedDate } from '../../shared/lib/salaryShift.js'
import { COUNTRIES, addMonths } from '../vouchers/voucherMath.js'

export { COUNTRIES }

// ── Inflation ────────────────────────────────────────────────────────────────
// HICP, all items, annual average rate of change (%), per calendar year.
// Source: Eurostat, dataset prc_hicp_ainr (HICP – ECOICOP ver.2, annual data;
// the successor of prc_hicp_aind, which stopped at 2025), unit RCH_A_AVG,
// coicop18 TOTAL, geo BE and EL (Eurostat's code for Greece; 'GR' here).
// INFLATION_LATEST is the latest 12-month rate (prc_hicp_minr, unit RCH_A,
// coicop18 TOTAL): it stands in for a year that has no annual figure yet.
// Retrieved 2026-10-01 from
// https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_ainr
// and …/prc_hicp_minr. Refreshed with each release (part of the release steps).
export const INFLATION = {
  BE: {
    2015: 0.6, 2016: 1.8, 2017: 2.2, 2018: 2.3, 2019: 1.3, 2020: 0.4,
    2021: 3.2, 2022: 10.3, 2023: 2.3, 2024: 4.3, 2025: 3.0,
  },
  GR: {
    2015: -1.1, 2016: 0.0, 2017: 1.1, 2018: 0.8, 2019: 0.5, 2020: -1.3,
    2021: 0.6, 2022: 9.3, 2023: 4.2, 2024: 3.0, 2025: 2.9,
  },
}
export const INFLATION_LATEST = {
  BE: { month: '2026-08', rate: 4.2 },
  GR: { month: '2026-08', rate: 3.7 },
}
// The first year the table covers: the price comparison starts no earlier.
export const INFLATION_FROM = 2015

// A year's inflation (%) for `country`: the annual figure, or the latest
// 12-month rate for a year that has none yet (this year).
export function inflationRate(country, year) {
  return INFLATION[country]?.[year] ?? INFLATION_LATEST[country].rate
}

// The country prices are compared against: the one the user picked, else the
// meal-voucher country, else the app's language (Greek → Greece, else Belgium).
export function defaultCountry({ picked, voucherCountry, language }) {
  if (COUNTRIES.includes(picked)) return picked
  if (COUNTRIES.includes(voucherCountry)) return voucherCountry
  return language === 'el' ? 'GR' : 'BE'
}

// ── Detection thresholds ─────────────────────────────────────────────────────
const RAISE_MIN = 0.01 // the regular pay moves by ≥ 1% (and holds the next month)
const EXTRA_MIN = 0.1 // a second salary payment ≥ 10% of the pay is an extra
const LUMP_MIN = 1.4 // one payment ≥ 1.4× the pay in May/June/Dec holds an extra
export const EXTRA_KINDS = ['holiday', 'thirteenth', 'bonus']
export const FIX_KINDS = [...EXTRA_KINDS, 'regular']
export const HORIZONS = [1, 3, 5, 10]
export const WHAT_IF = { min: 0, max: 10, step: 0.5, start: 2 } // % a year
const HOLIDAY_MONTHS = [5, 6]
const THIRTEENTH_MONTHS = [12]
const INDEXATION_YEARS = 3
const SINCE_CHOICES = 4

export const monthOf = (iso) => iso.slice(0, 7)
export const yearOf = (key) => Number(key.slice(0, 4))
export const monthNum = (key) => Number(key.slice(5, 7))
export const monthsBetween = (a, b) => (yearOf(b) - yearOf(a)) * 12 + monthNum(b) - monthNum(a)
const change = (from, to) => (from ? (to - from) / from : 0)

// What a payment in month `m` (1–12) most likely is when it comes on top.
function guessKind(m) {
  if (HOLIDAY_MONTHS.includes(m)) return 'holiday'
  if (THIRTEENTH_MONTHS.includes(m)) return 'thirteenth'
  return 'bonus'
}

// ── The corrections document ─────────────────────────────────────────────────
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
export const MAX_FIXES = 1000

// The notes as the app keeps them (anything malformed dropped), or an empty set.
export function normaliseNotes(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const fixes = {}
  const given = src.fixes && typeof src.fixes === 'object' && !Array.isArray(src.fixes) ? src.fixes : {}
  for (const [id, kind] of Object.entries(given)) {
    if (ID.test(id) && FIX_KINDS.includes(kind) && Object.keys(fixes).length < MAX_FIXES) fixes[id] = kind
  }
  return {
    v: 1,
    fixes,
    ...(typeof src.bonus_category_id === 'string' && ID.test(src.bonus_category_id)
      ? { bonus_category_id: src.bonus_category_id } : {}),
    ...(COUNTRIES.includes(src.country) ? { country: src.country } : {}),
  }
}

// The notes with entry `id` set to `kind`, keeping only fixes of entries that
// still exist (`ids`: the salary and bonus entries' ids).
export function withFix(notes, id, kind, ids) {
  const keep = new Set(ids)
  const fixes = Object.fromEntries(Object.entries(normaliseNotes(notes).fixes).filter(([k]) => keep.has(k) && k !== id))
  if (FIX_KINDS.includes(kind)) fixes[id] = kind
  return { ...normaliseNotes(notes), fixes }
}

// The Bonus category: the one the user picked (if it's still one of their
// income categories), else the default one (default_key 'bonus', 0094), an
// active one first. null when there's none: the page offers a picker.
export function bonusCategoryId(categories, notes) {
  const income = categories.filter((c) => c.kind === 'income')
  const picked = notes?.bonus_category_id
  if (picked && income.some((c) => c.id === picked)) return picked
  const own = income.filter((c) => c.default_key === 'bonus')
  return (own.find((c) => !c.is_archived) ?? own[0])?.id ?? null
}

// ── Regular pay and extras ───────────────────────────────────────────────────
// Each month's regular pay and the extras, from the entries. The month is the
// one a payment counts for (the salary shift moves a late salary to the next).
//   - the regular payment is the salary payment closest to the pay so far
//     (the largest in the first month);
//   - one payment ≥ LUMP_MIN × the pay in May/June/December is split: the pay,
//     and the rest as an extra "inside that month's pay";
//   - another salary payment ≥ EXTRA_MIN × the pay is an extra, guessed from
//     the month it was paid in (May/June holiday pay, December 13th month,
//     else bonus); a smaller one is part of the regular pay;
//   - every Bonus-category entry is a bonus (not a guess);
//   - `fixes` (the user's corrections, by entry id) always win: 'regular'
//     counts the whole payment as pay; a kind makes it that extra (a split
//     payment keeps its split).
// Returns { months: [{ key, regular }] from the first salary month to the
// last (a month with no pay has regular 0), extras: [{ id, date, key, kind,
// minor, guess, fixed, inPay, description }] } — plus `regularFixed`, the
// entries the user counted as pay, so they can change their mind.
export function splitPay(entries, { salaryId, bonusId = null, currency, fixes = {}, shift = null }) {
  const byMonth = new Map()
  for (const r of entries) {
    if (r.kind !== 'income' || !r.category_id) continue
    if (r.category_id !== salaryId && r.category_id !== bonusId) continue
    const key = monthOf(countedDate(r, shift))
    const row = { ...r, minor: toBaseMinor(Number(r.amount_minor), r.exchange_rate ?? 1, r.currency, currency) }
    if (!byMonth.has(key)) byMonth.set(key, [])
    byMonth.get(key).push(row)
  }
  const salaryKeys = [...byMonth.entries()].filter(([, rows]) => rows.some((r) => r.category_id === salaryId))
    .map(([k]) => k).sort()
  const empty = { months: [], extras: [], regularFixed: [] }
  if (!salaryKeys.length) return empty
  const first = salaryKeys[0]
  const last = salaryKeys[salaryKeys.length - 1]
  const keys = [...new Set([...byMonth.keys(), ...monthRange(first, last)])].sort()

  const months = []
  const extras = []
  const regularFixed = []
  let level = null
  const extra = (r, kind, minor, { guess = false, inPay = false } = {}) => extras.push({
    id: r.id, date: r.spent_at, key: monthOf(countedDate(r, shift)), kind, minor, guess,
    fixed: !!fixes[r.id], inPay, description: r.description ?? null,
  })
  for (const key of keys) {
    const rows = [...(byMonth.get(key) ?? [])].sort((a, b) => b.minor - a.minor || String(a.id).localeCompare(String(b.id)))
    const salary = rows.filter((r) => r.category_id === salaryId)
    const main = level == null ? salary[0]
      : [...salary].sort((a, b) => Math.abs(a.minor - level) - Math.abs(b.minor - level))[0]
    let regular = 0
    for (const r of rows) {
      const fix = fixes[r.id]
      const kind = guessKind(monthNum(r.spent_at))
      const lump = r === main && level != null && kind !== 'bonus' && r.minor >= level * LUMP_MIN
      if (fix === 'regular') { regular += r.minor; regularFixed.push({ id: r.id, date: r.spent_at, key, minor: r.minor, description: r.description ?? null }); continue }
      if (lump) {
        regular += level
        extra(r, fix ?? kind, r.minor - level, { guess: !fix, inPay: true })
        continue
      }
      if (fix) { extra(r, fix, r.minor); continue }
      if (r.category_id !== salaryId) { extra(r, 'bonus', r.minor); continue }
      if (r === main || (level != null && r.minor < level * EXTRA_MIN)) { regular += r.minor; continue }
      extra(r, kind, r.minor, { guess: true })
    }
    if (key >= first && key <= last) months.push({ key, regular })
    if (regular > 0) level = regular
  }
  return { months, extras, regularFixed }
}

// Every 'YYYY-MM' from `a` to `b`, both included.
function monthRange(a, b) {
  const out = []
  for (let k = a; k <= b; k = addMonths(k, 1)) out.push(k)
  return out
}

// ── Raises ───────────────────────────────────────────────────────────────────
// The pay's level month by month, and its changes. A change of ≥ RAISE_MIN
// that holds the next month with pay (or is the latest) is a raise (or a cut
// when it's down); a one-month blip is ignored. A month without pay keeps
// the level. Returns { steps: [{ key, level }], raises: [{ key, from, to, pct }] }.
export function payLevels(months) {
  const paid = months.filter((m) => m.regular > 0)
  const steps = []
  const raises = []
  let level = null
  for (const m of months) {
    if (m.regular > 0) {
      if (level == null) level = m.regular
      else if (Math.abs(change(level, m.regular)) >= RAISE_MIN) {
        const next = paid[paid.indexOf(m) + 1]
        if (!next || Math.abs(change(m.regular, next.regular)) < RAISE_MIN) {
          raises.push({ key: m.key, from: level, to: m.regular, pct: change(level, m.regular) })
          level = m.regular
        }
      }
    }
    if (level != null) steps.push({ key: m.key, level })
  }
  return { steps, raises }
}

// What a raise was: 'cut' (pay down), 'indexation' (Belgium's automatic
// January rise: at most last year's inflation + 1 point) or 'raise'.
export function raiseKind(raise, country) {
  if (raise.pct < 0) return 'cut'
  if (country === 'BE' && monthNum(raise.key) === 1
      && raise.pct * 100 <= inflationRate('BE', yearOf(raise.key) - 1) + 1) return 'indexation'
  return 'raise'
}

// The average raise a year: compound growth from the first level to the
// latest over the time between them; null with less than a year of pay.
export function averageRaise(steps) {
  if (steps.length < 2) return null
  const first = steps[0]
  const last = steps[steps.length - 1]
  const months = monthsBetween(first.key, last.key)
  if (months < 12) return null
  return (last.level / first.level) ** (12 / months) - 1
}

// ── Years ────────────────────────────────────────────────────────────────────
// Per calendar year: { year, regular, extras, total, months (with pay) },
// oldest first. Bonuses count here (it's what was paid).
export function yearTotals(months, extras) {
  const years = new Map()
  const at = (y) => {
    if (!years.has(y)) years.set(y, { year: y, regular: 0, extras: 0, months: 0 })
    return years.get(y)
  }
  for (const m of months) {
    if (m.regular <= 0) continue
    const y = at(yearOf(m.key))
    y.regular += m.regular
    y.months += 1
  }
  for (const e of extras) at(yearOf(e.key)).extras += e.minor
  return [...years.values()].map((y) => ({ ...y, total: y.regular + y.extras })).sort((a, b) => a.year - b.year)
}

// ── Against prices ───────────────────────────────────────────────────────────
// How much prices rose from the start of month `fromKey` to the start of
// `toKey`: each calendar year's inflation for the months of it in between,
// compounded.
export function priceRise(country, fromKey, toKey) {
  let f = 1
  for (let k = fromKey; k < toKey; k = addMonths(k, 1)) f *= (1 + inflationRate(country, yearOf(k)) / 100) ** (1 / 12)
  return f - 1
}

// The years the comparison can start in: those with pay and inflation
// figures, the latest year left out (unless it's the only one), the last
// SINCE_CHOICES of them.
export function sinceChoices(steps) {
  const years = [...new Set(steps.map((s) => yearOf(s.key)))].filter((y) => y >= INFLATION_FROM)
  const choices = years.length > 1 ? years.slice(0, -1) : years
  return choices.slice(-SINCE_CHOICES)
}

// The pay against prices since `fromYear`: the level in its first month with
// pay against the latest. { fromKey, start, now, pay, prices, real, gap }
// where `gap` is the monthly pay above (+) or below (−) keeping up. null when
// there's nothing to compare.
export function vsInflation(steps, country, fromYear) {
  const start = steps.find((s) => yearOf(s.key) >= fromYear)
  const now = steps[steps.length - 1]
  if (!start || !now || start.key === now.key) return null
  const pay = change(start.level, now.level)
  const prices = priceRise(country, start.key, now.key)
  return {
    fromKey: start.key, start: start.level, now: now.level, pay, prices,
    real: (1 + pay) / (1 + prices) - 1,
    gap: now.level - Math.round(start.level * (1 + prices)),
  }
}

// "Indexation only": the average inflation of the last INDEXATION_YEARS full
// years before `nowKey`'s, as a rate (0.031).
export function indexationRate(country, nowKey) {
  const y = yearOf(nowKey)
  let sum = 0
  for (let i = 1; i <= INDEXATION_YEARS; i++) sum += inflationRate(country, y - i)
  return sum / INDEXATION_YEARS / 100
}

// ── Projections ──────────────────────────────────────────────────────────────
// Holiday pay and the 13th month as a share of the pay, from the latest year
// each was paid (only if that's this year or last — an extra that stopped
// isn't projected), with the month it comes in. Bonuses are never projected.
// { holiday?: { ratio, month }, thirteenth?: { ratio, month } }
export function extraRatios(extras, steps, nowKey) {
  const levelAt = new Map(steps.map((s) => [s.key, s.level]))
  const out = {}
  for (const kind of ['holiday', 'thirteenth']) {
    const list = extras.filter((e) => e.kind === kind)
    if (!list.length) continue
    const latest = Math.max(...list.map((e) => yearOf(e.key)))
    if (latest < yearOf(nowKey) - 1) continue
    const those = list.filter((e) => yearOf(e.key) === latest).sort((a, b) => (a.key < b.key ? -1 : 1))
    const level = levelAt.get(those[0].key) ?? steps[steps.length - 1]?.level
    if (!level) continue
    out[kind] = { ratio: those.reduce((s, e) => s + e.minor, 0) / level, month: monthNum(those[0].key) }
  }
  return out
}

// The pay over `years` from the month after `nowKey`, rising by `rate` every
// January, with holiday pay and the 13th month at their ratios.
// { rate, monthly (the last month's pay), regular, extras, total, series:
// [{ key, pay }] (from `nowKey`) }.
export function project({ level, rate, years, nowKey, ratios = {} }) {
  let pay = level
  let regular = 0
  let extras = 0
  const series = [{ key: nowKey, pay }]
  for (let i = 1; i <= years * 12; i++) {
    const key = addMonths(nowKey, i)
    const m = monthNum(key)
    if (m === 1) pay = Math.round(pay * (1 + rate))
    regular += pay
    for (const x of Object.values(ratios)) if (x.month === m) extras += Math.round(pay * x.ratio)
    series.push({ key, pay })
  }
  return { rate, monthly: pay, regular, extras, total: regular + extras, series }
}

// How much of a GROSS raise reaches NET pay: a rough estimate, not a tax
// calculation. Indexation and raises are on gross pay, but the pay history is
// net, and each extra euro loses social security and income tax at the
// marginal rate. Belgium: 13.07% social security, then a 40–50% marginal
// rate plus the commune's surcharge on a typical salary → about half. Greece:
// about 13.9% social security, then a 28–44% marginal rate → a bit more than
// half. The app says it's an estimate wherever it's used (SalaryOutlook).
export const NET_SHARE = { BE: 0.5, GR: 0.55 }
const DEFAULT_NET_SHARE = 0.5

// A gross yearly raise as the net raise it gives, roughly (NET_SHARE).
export function netRate(grossRate, country) {
  return grossRate * (NET_SHARE[country] ?? DEFAULT_NET_SHARE)
}

// The three ways ahead: 'trend' (the average raise so far, already net: it
// comes from the net pay history; left out without a year of pay), 'index'
// (inflation only) and 'whatIf' (the slider's % a year). The last two are
// gross raises: projected at their net share (netRate), with `gross` kept to
// show both.
export function projections(report, { country, years, whatIf, nowKey }) {
  const args = { level: report.level, years, nowKey, ratios: report.ratios }
  const ways = [
    report.average != null && { id: 'trend', rate: report.average, gross: null },
    { id: 'index', gross: indexationRate(country, nowKey) },
    { id: 'whatIf', gross: whatIf / 100 },
  ].filter(Boolean)
  return ways.map((w) => {
    const rate = w.gross == null ? w.rate : netRate(w.gross, country)
    return { id: w.id, gross: w.gross, ...project({ ...args, rate }) }
  })
}

// ── The pay chart ────────────────────────────────────────────────────────────
// One row a month from the first pay: { key, level, pay, off, holiday,
// thirteenth, bonus }. `pay` is the month's real regular pay (null in a month
// without pay: no dot), `level` the regular pay as payLevels keeps it, `off`
// marks a pay RAISE_MIN or more away from the level (a one-month blip, or
// a month the level ignores), and the extras are that month's totals.
export function payChartRows({ months, steps, extras }) {
  const pay = new Map(months.map((m) => [m.key, m.regular]))
  const rows = new Map(steps.map((s) => {
    const p = pay.get(s.key) > 0 ? pay.get(s.key) : null
    return [s.key, {
      key: s.key, level: s.level, pay: p, off: p != null && Math.abs(change(s.level, p)) >= RAISE_MIN,
      holiday: 0, thirteenth: 0, bonus: 0,
    }]
  }))
  for (const e of extras) { const r = rows.get(e.key); if (r) r[e.kind] += e.minor }
  return [...rows.values()]
}

// The chart's value axis in major units (`factor`: minor units per major):
// { domain: [lo, hi], ticks } around every level and dot, padded, on round
// steps (1, 2 or 5 × a power of ten) of at least a tenth of the top's power
// of ten, so the compact tick labels (chartAxis: "2.3k", "2.4k") never repeat.
const AXIS_STEPS = 4
const AXIS_PAD = 0.15 // of the span, above and below
const AXIS_MIN_HALF = 0.05 // a flat line still gets ±5% around it
export function payChartAxis(rows, factor = 100) {
  const values = rows.flatMap((r) => (r.pay == null ? [r.level] : [r.level, r.pay])).map((v) => v / factor)
  const low = Math.min(...values)
  const high = Math.max(...values)
  const half = Math.max((high - low) * (0.5 + AXIS_PAD), high * AXIS_MIN_HALF)
  const mid = (high + low) / 2
  const [from, to] = [Math.max(0, mid - half), mid + half]
  const floor = 10 ** (Math.floor(Math.log10(Math.max(high, 1))) - 1)
  const raw = Math.max((to - from) / AXIS_STEPS, floor)
  const power = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 5, 10].map((n) => n * power).find((s) => s >= raw - 1e-9)
  const lo = Math.floor(from / step) * step
  const hi = Math.ceil(to / step) * step
  const ticks = []
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v / step) * step)
  return { domain: [lo, hi], ticks }
}

// The months off the level, the latest `max` of them (oldest first), and how
// many more there are: { months: [{ key, pay, level }], more }.
export function offMonths(rows, max = 3) {
  const off = rows.filter((r) => r.off)
  return {
    months: off.slice(-max).map(({ key, pay, level }) => ({ key, pay, level })),
    more: Math.max(0, off.length - max),
  }
}

// ── The page ─────────────────────────────────────────────────────────────────
// Everything the page shows, or null when there's no salary entry.
// { months, extras, regularFixed, steps, raises, level (the latest pay),
//   lastRaise (the latest rise), since (months since it), average, years,
//   ratios, paidMonths }
export function salaryReport(entries, { salaryId, bonusId, currency, notes, shift, nowKey }) {
  if (!salaryId) return null
  const fixes = normaliseNotes(notes).fixes
  const { months, extras, regularFixed } = splitPay(entries, { salaryId, bonusId, currency, fixes, shift })
  if (!months.length) return null
  const { steps, raises } = payLevels(months)
  if (!steps.length) return null
  const rises = raises.filter((r) => r.pct > 0)
  const lastRaise = rises[rises.length - 1] ?? null
  return {
    months, extras, regularFixed, steps, raises,
    level: steps[steps.length - 1].level,
    lastRaise,
    since: lastRaise ? Math.max(0, monthsBetween(lastRaise.key, nowKey)) : null,
    average: averageRaise(steps),
    years: yearTotals(months, extras),
    ratios: extraRatios(extras, steps, nowKey),
    paidMonths: months.filter((m) => m.regular > 0).length,
  }
}
