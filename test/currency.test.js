import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toMinor, fromMinor, formatMoney, toBaseMinor, minorFactor, baseEquivalent } from '../src/shared/lib/currency.js'

test('toMinor/fromMinor round-trip (2-decimal currency)', () => {
  assert.equal(toMinor('12.34', 'EUR'), 1234)
  assert.equal(fromMinor(1234, 'EUR'), 12.34)
})

test('zero-decimal currencies use factor 1', () => {
  assert.equal(minorFactor('JPY'), 1)
  assert.equal(toMinor('500', 'JPY'), 500)
  assert.equal(fromMinor(500, 'JPY'), 500)
})

test('toMinor rounds instead of truncating float artefacts', () => {
  // 19.90 * 100 === 1989.9999… in floats; must land on 1990.
  assert.equal(toMinor('19.90', 'EUR'), 1990)
})

test('formatMoney renders the currency', () => {
  const s = formatMoney(1234, 'EUR')
  assert.ok(s.includes('12.34') || s.includes('12,34'), s)
})

test('toBaseMinor applies the captured exchange rate', () => {
  // 100.00 USD at rate 0.9 -> 90.00 EUR
  assert.equal(toBaseMinor(10000, 0.9, 'USD', 'EUR'), 9000)
  // Same currency: rate ignored/1 — amount unchanged.
  assert.equal(toBaseMinor(10000, 1, 'EUR', 'EUR'), 10000)
})

test('baseEquivalent: converts foreign rows at the captured rate', () => {
  assert.deepEqual(baseEquivalent(4250, 1.17, 'GBP', 'EUR'), { baseMinor: 4973, rate: 1.17 })
  assert.deepEqual(baseEquivalent(1800, '0.0062', 'JPY', 'EUR'), { baseMinor: 1116, rate: 0.0062 })
})

test('baseEquivalent: null for base-currency rows or a missing rate', () => {
  assert.equal(baseEquivalent(500, 1, 'EUR', 'EUR'), null)
  assert.equal(baseEquivalent(500, null, 'USD', 'EUR'), null)
  assert.equal(baseEquivalent(500, 0, 'USD', 'EUR'), null)
})

// --- Exchange rates (pure parts of the ECB/Frankfurter integration) --------
import {
  CURRENCIES, fxUrl, fxRangeUrl, fxQueryDate, parseFxResponse, parseFxSeries, rateOnOrBefore,
  fxCacheKey, isFinalFx, parseManualRate, formatRate, FX_API,
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

test('formatMoney shows exactly the stored minor units (ICU rounds HUF/IDR to 0)', () => {
  assert.match(formatMoney(1250, 'HUF', 'en'), /12\.50/)
  assert.match(formatMoney(1250, 'IDR', 'en'), /12\.50/)
  assert.match(formatMoney(1800, 'JPY', 'en'), /1,800$/)
  assert.match(formatMoney(2500, 'ISK', 'en'), /2,500$/)
  for (const c of CURRENCIES) {
    const digits = (formatMoney(123456, c, 'en').split('.')[1] ?? '').replace(/\D/g, '').length
    assert.equal(10 ** digits, minorFactor(c), c)
  }
})

test('toBaseMinor across decimal places: ¥1,800 at 0.0053862 is €9.70, not €0.10', () => {
  assert.equal(toBaseMinor(1800, 0.0053862, 'JPY', 'EUR'), 970)
  assert.equal(toBaseMinor(4250, 185.66, 'EUR', 'JPY'), 7891)
  assert.equal(toBaseMinor(2500, 0.0070621, 'ISK', 'EUR'), 1766)
})

test('fxUrl: EUR-based request for the asked day; EUR itself is implied', () => {
  assert.equal(fxUrl('USD', 'EUR', '2026-08-21'), `${FX_API}/2026-08-21?base=EUR&symbols=USD`)
  assert.equal(fxUrl('GBP', 'JPY', '2026-08-21'), `${FX_API}/2026-08-21?base=EUR&symbols=GBP,JPY`)
  assert.ok(FX_API.startsWith('https://'))
})

test('fxRangeUrl starts a week early so a weekend start still has a rate', () => {
  assert.equal(fxRangeUrl('USD', 'EUR', '2026-03-01', '2026-03-31'),
    `${FX_API}/2026-02-22..2026-03-31?base=EUR&symbols=USD`)
})

test('fxQueryDate: the expense date, clamped to today', () => {
  assert.equal(fxQueryDate('2026-08-21', '2026-09-23'), '2026-08-21')
  assert.equal(fxQueryDate('2026-12-01', '2026-09-23'), '2026-09-23')
  assert.equal(fxQueryDate('', '2026-09-23'), '2026-09-23')
})

test('parseFxResponse: cross rate from EUR-based rates', () => {
  const j = { amount: 1, base: 'EUR', date: '2026-08-21', rates: { GBP: 0.8567, USD: 1.1699, JPY: 185.66 } }
  assert.deepEqual(parseFxResponse(j, 'USD', 'EUR'), { rate: 0.85477391, date: '2026-08-21' })
  assert.deepEqual(parseFxResponse(j, 'EUR', 'USD'), { rate: 1.1699, date: '2026-08-21' })
  assert.deepEqual(parseFxResponse(j, 'GBP', 'USD'), { rate: 1.36558889, date: '2026-08-21' })
  assert.deepEqual(parseFxResponse(j, 'JPY', 'EUR'), { rate: 0.00538619, date: '2026-08-21' })
})

test('parseFxResponse: errors and garbage give null — never 1', () => {
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
