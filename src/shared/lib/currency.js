// Currency helpers. Money is stored as integer minor units (cents).
import { ZERO_DECIMAL, toBaseMinor } from '../../../supabase/functions/_shared/money.ts'
import { STORAGE_KEYS } from './keys.js'
import { intlLocale } from './i18n/i18n.js'

// Supported currencies: every currency the ECB publishes a daily reference
// rate for (so each one can be converted to any other), EUR first — it's the
// app default — then the most common travel currencies, then A–Z.
export const CURRENCIES = [
  'EUR', 'USD', 'GBP', 'CHF', 'JPY',
  'AUD', 'BRL', 'CAD', 'CNY', 'CZK', 'DKK', 'HKD', 'HUF', 'IDR', 'ILS',
  'INR', 'ISK', 'KRW', 'MXN', 'MYR', 'NOK', 'NZD', 'PHP', 'PLN', 'RON',
  'SEK', 'SGD', 'THB', 'TRY', 'ZAR',
]

// Minor units per ISO 4217: most currencies have 2 decimal places; the
// zero-decimal set (one copy, in _shared/money.ts, checked against the SQL
// minor-unit helper) has 0. HUF and IDR are 2 in ISO even though cash rounds
// to whole units; VND/CLP aren't selectable but may appear in old rows.
export function minorFactor(currency = 'EUR') {
  return ZERO_DECIMAL.has(currency) ? 1 : 100
}

export function toMinor(amount, currency = 'EUR') {
  return Math.round(Number(amount) * minorFactor(currency))
}

export function fromMinor(minor, currency = 'EUR') {
  return Number(minor) / minorFactor(currency)
}

// An amount as an edit field shows it: the currency's decimals, a dot, no
// grouping — "18.50", or "1800" for a zero-decimal currency. It's the raw
// string MoneyInput and toMinor() take.
export function minorToInput(minor, currency = 'EUR') {
  const factor = minorFactor(currency)
  return (Number(minor) / factor).toFixed(factor === 1 ? 0 : 2)
}

// Decimals come from our minor units, not ICU's defaults: ICU shows HUF and
// IDR with 0 decimals although ISO 4217 (and our storage) has 2, which would
// round 12.50 to "13" on screen. The locale is the app language's (Greek:
// "1.234,56 €"); in English, the device's own, as always.
export function formatMoney(minor, currency = 'EUR', locale = intlLocale()) {
  const digits = Math.log10(minorFactor(currency))
  return new Intl.NumberFormat(locale, {
    style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits,
  }).format(fromMinor(minor, currency))
}

// A signed amount for display, with a true minus sign: −€1.00 below zero,
// €0.00 at zero, and €1.00 above — or +€1.00 with `plus` (a change, a net or
// an income). Tones for these live in the UI kit (kitMath.signTone).
export function formatSigned(minor, currency = 'EUR', { plus = false } = {}) {
  const sign = minor < 0 ? '−' : plus && minor > 0 ? '+' : ''
  return `${sign}${formatMoney(Math.abs(minor), currency)}`
}

// toBaseMinor: a minor amount in the base currency at the row's captured rate
// — exact integer maths that matches SQL to_base_minor. One copy, shared with
// the edge functions (the statement's totals must agree with the app's).
export { toBaseMinor }

// ---------------------------------------------------------------------------
// Pending rates. A row the server wrote without a known rate (a mirrored group
// share or a recurring entry whose ECB rate isn't cached yet) has
// exchange_rate = null until the server's rate cache fills it in, usually
// within minutes. Until then the client converts it at read time with the ECB
// rate for the row's date (fx.js fillPendingRates) and flags it estimated.
// ---------------------------------------------------------------------------
const isPending = (r, base) => r.exchange_rate == null && r.currency && r.currency !== base

// Which ECB series to fetch: Map<currency, { first, last }> (the date span of
// that currency's pending rows). Empty when nothing is pending.
export function pendingRateSpans(rows, baseCurrency) {
  const spans = new Map()
  for (const r of rows ?? []) {
    if (!isPending(r, baseCurrency)) continue
    const s = spans.get(r.currency)
    if (!s) spans.set(r.currency, { first: r.spent_at, last: r.spent_at })
    else {
      if (r.spent_at < s.first) s.first = r.spent_at
      if (r.spent_at > s.last) s.last = r.spent_at
    }
  }
  return spans
}

// Rows with each pending rate filled from `seriesByCurrency` (Map<currency,
// [[date, rate]]>) as { exchange_rate, rate_estimated: true }. A row whose
// series has no rate on or before its date stays pending (null — never 1).
export function withEstimatedRates(rows, baseCurrency, seriesByCurrency, todayIso) {
  return (rows ?? []).map((r) => {
    if (!isPending(r, baseCurrency)) return r
    const hit = rateOnOrBefore(seriesByCurrency.get(r.currency) ?? [], fxQueryDate(r.spent_at, todayIso))
    return hit ? { ...r, exchange_rate: hit.rate, rate_estimated: true } : r
  })
}

// A foreign-currency row's value in the user's base currency, for display
// next to the original amount: { baseMinor, rate }, or null when the row is
// already in the base currency or has no captured rate.
export function baseEquivalent(minor, exchangeRate, fromCurrency, baseCurrency) {
  const rate = Number(exchangeRate)
  if (!fromCurrency || fromCurrency === baseCurrency || !(rate > 0)) return null
  return { baseMinor: toBaseMinor(minor, rate, fromCurrency, baseCurrency), rate }
}

// ---------------------------------------------------------------------------
// Exchange rates (pure parts). The network/cache side lives in fx.js.
//
// Source: Frankfurter (ECB daily reference rates, keyless, CORS-enabled, with
// history back to 1999-01-04). We always ask for EUR-based rates and derive the
// cross rate ourselves: the ECB publishes EUR→X, so X→Y = (EUR→Y) / (EUR→X)
// keeps full precision (Frankfurter's own cross rates are rounded to 5 places,
// which is 0.2% off for JPY→EUR).
// ---------------------------------------------------------------------------
export const FX_API = 'https://api.frankfurter.dev/v1'

// The date to ask the rate for: the expense's date, but never the future (no
// rate exists yet) — a future-dated expense uses today's.
export function fxQueryDate(date, todayIso) {
  return !date || date > todayIso ? todayIso : date
}

const symbolsFor = (from, to) => [from, to].filter((c) => c !== 'EUR').join(',')

// URL for one day's rate. ECB doesn't publish at weekends/holidays; the API
// then answers with the previous business day (its `date` says which).
export function fxUrl(from, to, date) {
  return `${FX_API}/${date}?base=EUR&symbols=${symbolsFor(from, to)}`
}

// URL for a date range (one request covers a whole import). Starts a week
// early so a range that opens on a weekend/holiday still has a prior rate.
export function fxRangeUrl(from, to, firstDate, lastDate) {
  const d = new Date(`${firstDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 7)
  const start = d.toISOString().slice(0, 10) // UTC arithmetic on a UTC date: no shift
  return `${FX_API}/${start}..${lastDate}?base=EUR&symbols=${symbolsFor(from, to)}`
}

// Rates are stored as numeric(18, 8).
const round8 = (x) => Math.round(x * 1e8) / 1e8

// from→to rate out of one EUR-based `rates` object, or null if either side is
// missing or not a positive finite number. Never 1 as a fallback.
function crossRate(rates, from, to) {
  const r = { ...rates, EUR: 1 }
  const a = Number(r[from])
  const b = Number(r[to])
  if (!(a > 0) || !(b > 0) || !Number.isFinite(a) || !Number.isFinite(b)) return null
  const rate = round8(b / a)
  return rate > 0 ? rate : null
}

// Parse a one-day answer into { rate, date } (date = the ECB day it's from),
// or null for an error body / missing currency / garbage.
export function parseFxResponse(json, from, to) {
  if (!json || typeof json !== 'object' || !json.rates || typeof json.date !== 'string') return null
  const rate = crossRate(json.rates, from, to)
  return rate ? { rate, date: json.date } : null
}

// Parse a range answer into a sorted [[date, rate]] list (bad days skipped).
export function parseFxSeries(json, from, to) {
  if (!json || typeof json !== 'object' || !json.rates || typeof json.rates !== 'object') return []
  return Object.keys(json.rates).sort()
    .map((d) => [d, crossRate(json.rates[d], from, to)])
    .filter(([, rate]) => rate)
}

// The rate in effect on `date`: that day's, else the latest earlier one
// (weekends/holidays). null when the series has nothing on or before it.
export function rateOnOrBefore(series, date) {
  let hit = null
  for (const [d, rate] of series) {
    if (d > date) break
    hit = { rate, date: d }
  }
  return hit
}

// localStorage key for a cached rate. Versioned so the old v1 cache (which
// could hold a fake 1 from the broken provider) is never read.
export function fxCacheKey(from, to, date) {
  return `${STORAGE_KEYS.fxRatePrefix}${from}:${to}:${date}`
}

// Is an answer final, i.e. safe to cache under the date we asked for? A past
// date's answer never changes. Today's does once the ECB publishes (~16:00
// CET), so it's only final when it's actually today's rate.
export function isFinalFx(askedDate, answer, todayIso) {
  return !!answer && (askedDate < todayIso || answer.date === askedDate)
}

// A user-typed rate: a positive finite number (comma decimals allowed), else null.
export function parseManualRate(raw) {
  const n = Number(String(raw ?? '').trim().replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? round8(n) : null
}

// The rate an edit keeps: the saved row's `exchange_rate` while the entry is
// still in that foreign `currency` on that `date` (a new currency or date
// needs a new rate) — except a rate of exactly 1, the old broken lookup's
// fallback, which is looked up again. null when there's nothing to keep.
export function keptRate(saved, { currency, date, base }) {
  if (!saved || currency === base || currency !== saved.currency || date !== saved.spent_at) return null
  const rate = Number(saved.exchange_rate)
  return rate > 0 && rate !== 1 ? rate : null
}

// The rate a form converts with: 1 in the base currency, else the kept rate
// (keptRate), else the ECB's (`fx` from useFxRate), else the one typed when
// the ECB has none (`manual`); null while it isn't known yet.
export function effectiveRate({ needsFx, kept, fx, manual }) {
  if (!needsFx) return 1
  if (kept != null) return kept
  if (fx.status === 'ok') return fx.rate
  return fx.status === 'missing' ? parseManualRate(manual) : null
}

// A rate for display: 5 significant digits, no trailing zeros (1.1699,
// 0.0053862, 185.66; Greek writes the decimal comma: 1,1699).
export function formatRate(rate) {
  const n = Number(Number(rate).toPrecision(5))
  const locale = intlLocale()
  return locale ? n.toLocaleString(locale, { maximumSignificantDigits: 5 }) : String(n)
}

// A stored rate shown in full, as English always showed it (0.85477391), but
// with the app language's decimal mark (Greek 0,85477391).
export function rateText(rate) {
  const n = Number(rate)
  const locale = intlLocale()
  return locale ? n.toLocaleString(locale, { maximumFractionDigits: 20, useGrouping: false }) : String(n)
}
