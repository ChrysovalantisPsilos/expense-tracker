import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  toMinor, fromMinor, formatMoney, formatSigned, toBaseMinor, minorFactor, baseEquivalent, minorToInput,
  keptRate, effectiveRate,
} from '../src/shared/lib/currency.js'

test('toMinor/fromMinor: 2-decimal round trip, zero-decimal factor 1, rounding instead of truncating float artefacts', () => {
  assert.equal(toMinor('12.34', 'EUR'), 1234)
  assert.equal(fromMinor(1234, 'EUR'), 12.34)
  assert.equal(minorFactor('JPY'), 1)
  assert.equal(toMinor('500', 'JPY'), 500)
  assert.equal(fromMinor(500, 'JPY'), 500)
  // 19.90 * 100 === 1989.9999… in floats; must land on 1990.
  assert.equal(toMinor('19.90', 'EUR'), 1990)
})

test('formatSigned: true minus below zero, a plus only when asked, none at zero', () => {
  const eur = (m) => formatMoney(m, 'EUR')
  assert.equal(formatSigned(-1550, 'EUR'), `−${eur(1550)}`)
  assert.equal(formatSigned(1550, 'EUR'), eur(1550))
  assert.equal(formatSigned(1550, 'EUR', { plus: true }), `+${eur(1550)}`)
  assert.equal(formatSigned(0, 'EUR', { plus: true }), eur(0))
  assert.equal(formatSigned(-0, 'EUR'), eur(0))
  assert.equal(formatSigned(-500, 'JPY', { plus: true }), `−${formatMoney(500, 'JPY')}`)
})

// The same vectors as db_tests.sql #45 (public.to_base_minor): the client's
// split preview and the server's authoritative group amount must agree.
test('toBaseMinor is exact and matches SQL to_base_minor (half away from zero)', () => {
  assert.equal(toBaseMinor(4250, 1.1699, 'GBP', 'EUR'), 4972) // 4972.075
  assert.equal(toBaseMinor(275, 0.0062, 'JPY', 'EUR'), 171) // 170.5 — floats said 170
  assert.equal(toBaseMinor(50, 1.15, 'USD', 'EUR'), 58) // 57.5 — floats said 57
  assert.equal(toBaseMinor(1800, 0.0062, 'JPY', 'EUR'), 1116)
  assert.equal(toBaseMinor(1005, 1.005, 'USD', 'EUR'), 1010)
  assert.equal(toBaseMinor(12345, 0.85725, 'EUR', 'GBP'), 10583)
  assert.equal(toBaseMinor(10000, 162.35, 'EUR', 'JPY'), 16235)
  assert.equal(toBaseMinor(-50, 1.15, 'USD', 'EUR'), -58)
  assert.equal(toBaseMinor(0, 1.15, 'USD', 'EUR'), 0)
  assert.equal(toBaseMinor(1000, '0.9', 'USD', 'EUR'), 900) // rates may arrive as strings
})

test('baseEquivalent: converts foreign rows at the captured rate; null for base-currency rows or a missing rate', () => {
  assert.deepEqual(baseEquivalent(4250, 1.17, 'GBP', 'EUR'), { baseMinor: 4973, rate: 1.17 })
  assert.deepEqual(baseEquivalent(1800, '0.0062', 'JPY', 'EUR'), { baseMinor: 1116, rate: 0.0062 })
  assert.equal(baseEquivalent(500, 1, 'EUR', 'EUR'), null)
  assert.equal(baseEquivalent(500, null, 'USD', 'EUR'), null)
  assert.equal(baseEquivalent(500, 0, 'USD', 'EUR'), null)
})

// --- Exchange rates (pure parts of the ECB/Frankfurter integration) --------
import {
  CURRENCIES, fxUrl, fxRangeUrl, fxQueryDate, parseFxResponse, parseFxSeries, rateOnOrBefore,
  fxCacheKey, isFinalFx, parseManualRate, formatRate, rateText, FX_API,
} from '../src/shared/lib/currency.js'

test('CURRENCIES: the ECB set, EUR first, no duplicates, all ISO codes', () => {
  assert.equal(CURRENCIES[0], 'EUR')
  assert.equal(CURRENCIES.length, 30)
  assert.equal(new Set(CURRENCIES).size, CURRENCIES.length)
  for (const c of CURRENCIES) assert.match(c, /^[A-Z]{3}$/)
  for (const c of ['USD', 'GBP', 'JPY', 'KRW', 'ISK', 'HUF', 'IDR', 'THB']) assert.ok(CURRENCIES.includes(c), c)
})

test('minorFactor follows ISO 4217 minor units', () => {
  for (const c of ['JPY', 'KRW', 'ISK']) assert.equal(minorFactor(c), 1, c)
  for (const c of ['EUR', 'USD', 'HUF', 'IDR', 'CZK', 'INR']) assert.equal(minorFactor(c), 100, c)
})

test('formatMoney renders the currency with exactly the stored minor units (ICU rounds HUF/IDR to 0)', () => {
  const s = formatMoney(1234, 'EUR')
  assert.ok(s.includes('12.34') || s.includes('12,34'), s)
  assert.match(formatMoney(1250, 'HUF', 'en'), /12\.50/)
  assert.match(formatMoney(1250, 'IDR', 'en'), /12\.50/)
  assert.match(formatMoney(1800, 'JPY', 'en'), /1,800$/)
  assert.match(formatMoney(2500, 'ISK', 'en'), /2,500$/)
  for (const c of CURRENCIES) {
    const digits = (formatMoney(123456, c, 'en').split('.')[1] ?? '').replace(/\D/g, '').length
    assert.equal(10 ** digits, minorFactor(c), c)
  }
})

test('toBaseMinor applies the captured rate across decimal places: ¥1,800 at 0.0053862 is €9.70, not €0.10', () => {
  // 100.00 USD at rate 0.9 -> 90.00 EUR
  assert.equal(toBaseMinor(10000, 0.9, 'USD', 'EUR'), 9000)
  // Same currency: rate ignored/1 — amount unchanged.
  assert.equal(toBaseMinor(10000, 1, 'EUR', 'EUR'), 10000)
  assert.equal(toBaseMinor(1800, 0.0053862, 'JPY', 'EUR'), 970)
  assert.equal(toBaseMinor(4250, 185.66, 'EUR', 'JPY'), 7891)
  assert.equal(toBaseMinor(2500, 0.0070621, 'ISK', 'EUR'), 1766)
})

test('fxUrl / fxRangeUrl: EUR-based request for the asked day (a range starts a week early); EUR itself is implied', () => {
  assert.equal(fxUrl('USD', 'EUR', '2026-08-21'), `${FX_API}/2026-08-21?base=EUR&symbols=USD`)
  assert.equal(fxUrl('GBP', 'JPY', '2026-08-21'), `${FX_API}/2026-08-21?base=EUR&symbols=GBP,JPY`)
  assert.ok(FX_API.startsWith('https://'))
  // fxRangeUrl starts a week early so a weekend start still has a rate.
  assert.equal(fxRangeUrl('USD', 'EUR', '2026-03-01', '2026-03-31'),
    `${FX_API}/2026-02-22..2026-03-31?base=EUR&symbols=USD`)
})

test('fxQueryDate: the expense date, clamped to today', () => {
  assert.equal(fxQueryDate('2026-08-21', '2026-09-23'), '2026-08-21')
  assert.equal(fxQueryDate('2026-12-01', '2026-09-23'), '2026-09-23')
  assert.equal(fxQueryDate('', '2026-09-23'), '2026-09-23')
})

test('parseFxResponse: cross rate from EUR-based rates; errors and garbage give null — never 1', () => {
  const j = { amount: 1, base: 'EUR', date: '2026-08-21', rates: { GBP: 0.8567, USD: 1.1699, JPY: 185.66 } }
  assert.deepEqual(parseFxResponse(j, 'USD', 'EUR'), { rate: 0.85477391, date: '2026-08-21' })
  assert.deepEqual(parseFxResponse(j, 'EUR', 'USD'), { rate: 1.1699, date: '2026-08-21' })
  assert.deepEqual(parseFxResponse(j, 'GBP', 'USD'), { rate: 1.36558889, date: '2026-08-21' })
  assert.deepEqual(parseFxResponse(j, 'JPY', 'EUR'), { rate: 0.00538619, date: '2026-08-21' })
  // Errors and garbage give null — never 1.
  const bad = [
    null, undefined, 'x', {}, { message: 'not found' },
    { success: false, error: { type: 'missing_access_key' } }, // the old provider's answer
    { date: '2026-08-21', rates: {} },
    { date: '2026-08-21', rates: { USD: 0 } },
    { date: '2026-08-21', rates: { USD: -1 } },
    { date: '2026-08-21', rates: { USD: 'abc' } },
    { date: '2026-08-21', rates: { USD: Infinity } },
    { rates: { USD: 1.1 } },
  ]
  for (const j of bad) assert.equal(parseFxResponse(j, 'USD', 'EUR'), null, JSON.stringify(j))
  // A currency the answer doesn't cover.
  assert.equal(parseFxResponse({ date: '2026-08-21', rates: { USD: 1.1 } }, 'GBP', 'EUR'), null)
})

test('parseFxSeries + rateOnOrBefore: weekends use the previous business day', () => {
  const j = { base: 'EUR', rates: {
    '2026-08-24': { USD: 1.17 }, '2026-08-21': { USD: 1.1699 }, '2026-08-20': { USD: 'x' },
  } }
  const s = parseFxSeries(j, 'USD', 'EUR')
  assert.deepEqual(s.map(([d]) => d), ['2026-08-21', '2026-08-24'])
  assert.deepEqual(rateOnOrBefore(s, '2026-08-22'), { rate: 0.85477391, date: '2026-08-21' })
  assert.deepEqual(rateOnOrBefore(s, '2026-08-24'), { rate: 0.85470085, date: '2026-08-24' })
  assert.equal(rateOnOrBefore(s, '2026-08-20'), null)
  assert.deepEqual(parseFxSeries({ message: 'not found' }, 'USD', 'EUR'), [])
})

test('fxCacheKey: per pair and date, and not the old v1 namespace', () => {
  assert.equal(fxCacheKey('USD', 'EUR', '2026-08-21'), 'fx2:USD:EUR:2026-08-21')
  assert.notEqual(fxCacheKey('USD', 'EUR', '2026-08-21'), fxCacheKey('USD', 'EUR', '2026-08-22'))
  assert.doesNotMatch(fxCacheKey('USD', 'EUR', '2026-08-21'), /^fx:/)
})

test('isFinalFx: cache past days always, today only once today is published', () => {
  const a = (date) => ({ rate: 0.85, date })
  assert.equal(isFinalFx('2026-08-22', a('2026-08-21'), '2026-09-23'), true) // Saturday → Friday
  assert.equal(isFinalFx('2026-09-23', a('2026-09-22'), '2026-09-23'), false) // not out yet
  assert.equal(isFinalFx('2026-09-23', a('2026-09-23'), '2026-09-23'), true)
  assert.equal(isFinalFx('2026-08-21', null, '2026-09-23'), false) // failures are never cached
})

test('parseManualRate: positive numbers only, comma decimals allowed', () => {
  assert.equal(parseManualRate('1.17'), 1.17)
  assert.equal(parseManualRate('1,17'), 1.17)
  assert.equal(parseManualRate(' 0.0053862 '), 0.0053862)
  for (const v of ['', '0', '-1', 'abc', null, undefined, 'Infinity']) assert.equal(parseManualRate(v), null, String(v))
})

test('formatRate: five significant digits, no trailing zeros', () => {
  assert.equal(formatRate(0.85477391), '0.85477')
  assert.equal(formatRate(1.17), '1.17')
  assert.equal(formatRate(0.00538619), '0.0053862')
  assert.equal(formatRate(185.66), '185.66')
})

test('rateText: a stored rate in full, with the app language\'s decimal mark', async () => {
  const { loadLanguage } = await import('../src/shared/lib/i18n/i18n.js')
  assert.equal(rateText(0.85477391), '0.85477391') // English exactly as before
  assert.equal(rateText(1234.5), '1234.5')
  await loadLanguage('el')
  try {
    assert.equal(rateText(0.85477391), '0,85477391')
    assert.equal(rateText(1234.5), '1234,5') // no grouping in a rate
  } finally {
    await loadLanguage('en')
  }
})

// --- Pending rates (server hasn't rated a mirrored/recurring row yet) -------
import { pendingRateSpans, withEstimatedRates } from '../src/shared/lib/currency.js'

const pend = (o) => ({ exchange_rate: null, amount_minor: 1000, ...o })

test('pendingRateSpans: one date span per foreign currency, only for null rates', () => {
  const spans = pendingRateSpans([
    pend({ currency: 'GBP', spent_at: '2026-09-10' }),
    pend({ currency: 'GBP', spent_at: '2026-08-02' }),
    pend({ currency: 'USD', spent_at: '2026-09-01' }),
    pend({ currency: 'EUR', spent_at: '2026-09-01' }), // base currency: nothing to fetch
    { currency: 'JPY', spent_at: '2026-09-01', exchange_rate: 0.0062 }, // already rated
  ], 'EUR')
  assert.deepEqual([...spans], [
    ['GBP', { first: '2026-08-02', last: '2026-09-10' }],
    ['USD', { first: '2026-09-01', last: '2026-09-01' }],
  ])
  assert.equal(pendingRateSpans([], 'EUR').size, 0)
})

test('withEstimatedRates: the ECB rate on or before the row date, flagged; never 1', () => {
  const series = new Map([['GBP', [['2026-09-04', 1.17], ['2026-09-07', 1.18]]]])
  const rows = [
    pend({ id: 1, currency: 'GBP', spent_at: '2026-09-06' }), // Sunday → Friday's rate
    pend({ id: 2, currency: 'GBP', spent_at: '2026-09-30' }), // future → today's (07)
    pend({ id: 3, currency: 'GBP', spent_at: '2026-09-01' }), // before the series: stays pending
    pend({ id: 4, currency: 'USD', spent_at: '2026-09-06' }), // no series
    { id: 5, currency: 'GBP', spent_at: '2026-09-06', exchange_rate: 1.2 },
  ]
  const out = withEstimatedRates(rows, 'EUR', series, '2026-09-08')
  assert.deepEqual(out.map((r) => [r.id, r.exchange_rate, !!r.rate_estimated]), [
    [1, 1.17, true], [2, 1.18, true], [3, null, false], [4, null, false], [5, 1.2, false],
  ])
  assert.equal(rows[0].exchange_rate, null) // input untouched
})

test('minorToInput: an edit field shows the currency\'s decimals', () => {
  assert.equal(minorToInput(1850, 'EUR'), '18.50')
  assert.equal(minorToInput(1800, 'EUR'), '18.00')
  assert.equal(minorToInput(5, 'GBP'), '0.05')
  assert.equal(minorToInput(1800, 'JPY'), '1800')
  assert.equal(minorToInput(125000, 'KRW'), '125000')
  assert.equal(minorToInput(-4250, 'EUR'), '-42.50')
  assert.equal(toMinor(minorToInput(1999, 'EUR'), 'EUR'), 1999) // round-trips
})

test('keptRate: an edit keeps the saved rate while the currency and date stay, never a stored 1', () => {
  const saved = { currency: 'USD', spent_at: '2026-09-01', exchange_rate: '0.91' }
  const same = { currency: 'USD', date: '2026-09-01', base: 'EUR' }
  assert.equal(keptRate(saved, same), 0.91)
  assert.equal(keptRate(null, same), null) // adding: nothing saved
  assert.equal(keptRate(saved, { ...same, currency: 'GBP' }), null) // new currency
  assert.equal(keptRate(saved, { ...same, date: '2026-09-02' }), null) // new date
  assert.equal(keptRate(saved, { ...same, base: 'USD' }), null) // no conversion
  assert.equal(keptRate({ ...saved, exchange_rate: 1 }, same), null) // the old lookup fallback
  assert.equal(keptRate({ ...saved, exchange_rate: null }, same), null)
  assert.equal(keptRate({ ...saved, exchange_rate: 0 }, same), null)
})

test('effectiveRate: base currency 1, then the kept rate, the ECB rate, the typed rate', () => {
  const ok = { status: 'ok', rate: 0.9 }
  const missing = { status: 'missing' }
  const loading = { status: 'loading' }
  assert.equal(effectiveRate({ needsFx: false, kept: 0.8, fx: ok, manual: '2' }), 1)
  assert.equal(effectiveRate({ needsFx: true, kept: 0.8, fx: ok, manual: '' }), 0.8)
  assert.equal(effectiveRate({ needsFx: true, kept: null, fx: ok, manual: '2' }), 0.9)
  assert.equal(effectiveRate({ needsFx: true, kept: null, fx: missing, manual: '1,25' }), 1.25)
  assert.equal(effectiveRate({ needsFx: true, kept: null, fx: missing, manual: '' }), null)
  assert.equal(effectiveRate({ needsFx: true, kept: null, fx: loading, manual: '2' }), null)
})
