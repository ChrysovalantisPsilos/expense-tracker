// Exchange-rate data access: fetches ECB reference rates (Frankfurter) and
// caches real answers in localStorage. The parsing/URL/cache-key rules are pure
// and unit-tested in currency.js; this module only does the I/O.
//
// A failure is NEVER turned into a rate of 1: callers get null and must ask the
// user for a rate (or block the save) instead.
import { useEffect, useState } from 'react'
import {
  fxUrl, fxRangeUrl, fxCacheKey, fxQueryDate, isFinalFx, parseFxResponse, parseFxSeries,
  pendingRateSpans, withEstimatedRates,
} from './currency.js'
import { today } from './dates.js'

function readCache(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? 'null')
    return v && v.rate > 0 && typeof v.date === 'string' ? v : null
  } catch { return null }
}

function writeCache(key, answer) {
  try { localStorage.setItem(key, JSON.stringify(answer)) } catch { /* storage full/blocked */ }
}

// The v1 cache ("fx:FROM:TO:DAY") could hold a fake 1 from the old provider.
// Drop it once per page load so it can't linger on devices.
let legacyPurged = false
function purgeLegacyCache() {
  if (legacyPurged) return
  legacyPurged = true
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k && /^fx:[A-Z]{3}:/.test(k)) localStorage.removeItem(k)
    }
  } catch { /* storage unavailable */ }
}

async function getJson(url) {
  const res = await fetch(url)
  if (!res.ok) return null
  return res.json()
}

// from→to rate for the expense's `date` (YYYY-MM-DD; defaults to today):
// { rate, date } where `date` is the ECB day the rate is from (the previous
// business day at weekends), or null when no rate could be fetched.
async function getRate(from, to, date) {
  const now = today()
  const asked = fxQueryDate(date, now)
  if (from === to) return { rate: 1, date: asked }
  purgeLegacyCache()
  const key = fxCacheKey(from, to, asked)
  const cached = readCache(key)
  if (cached) return cached
  try {
    const answer = parseFxResponse(await getJson(fxUrl(from, to, asked)), from, to)
    if (isFinalFx(asked, answer, now)) writeCache(key, answer)
    return answer
  } catch {
    return null
  }
}

// Daily from→to rates covering firstDate..lastDate in one request, as a sorted
// [[date, rate]] list (use rateOnOrBefore to pick a day). [] on failure.
async function getRateSeries(from, to, firstDate, lastDate) {
  const now = today()
  const last = fxQueryDate(lastDate, now)
  try {
    return parseFxSeries(await getJson(fxRangeUrl(from, to, firstDate, last)), from, to)
  } catch {
    return []
  }
}

// One range request per source currency: `spans` is Map<currency, { first,
// last }> (the dates each currency needs a rate for); returns Map<currency,
// [[date, rate]]> of currency→`to` series ([] for one that failed).
export async function getRateSeriesMap(spans, to) {
  return new Map(await Promise.all([...spans].map(async ([cur, { first, last }]) =>
    [cur, await getRateSeries(cur, to, first, last)])))
}

// Transactions whose rate the server hasn't filled in yet (exchange_rate null:
// a mirrored group share or a recurring entry the ECB cache couldn't rate
// yet) get the ECB rate for their date, flagged `rate_estimated`, so totals
// are right before the server catches up. One range request per currency;
// rows still without a rate stay null (sums then leave them out — never 1:1).
export async function fillPendingRates(rows, baseCurrency) {
  const spans = pendingRateSpans(rows, baseCurrency)
  if (spans.size === 0) return rows
  return withEstimatedRates(rows, baseCurrency, await getRateSeriesMap(spans, baseCurrency), today())
}

// Form helper: the live rate for (from, to, date).
//   { status: 'same' }                      — no conversion needed
//   { status: 'loading' }
//   { status: 'ok', rate, date }
//   { status: 'missing' }                   — offline / unknown / API error
// `skip` (e.g. editing a row whose currency and date are unchanged, so its
// captured rate is kept) returns { status: 'skipped' } without fetching.
export function useFxRate(from, to, date, { skip = false } = {}) {
  const [state, setState] = useState({ status: 'loading' })
  const same = !from || !to || from === to

  useEffect(() => {
    if (same || skip) return undefined
    let live = true
    setState({ status: 'loading' })
    // Debounced: typing a date fires one change per keystroke.
    const t = setTimeout(async () => {
      const answer = await getRate(from, to, date)
      if (live) setState(answer ? { status: 'ok', ...answer } : { status: 'missing' })
    }, 250)
    return () => { live = false; clearTimeout(t) }
  }, [from, to, date, same, skip])

  if (same) return { status: 'same' }
  if (skip) return { status: 'skipped' }
  return state
}

// Today's rate per currency→base, one request each, shared by every caller
// (Home's Recurring card and the Overview both ask on the same render) and
// kept for the page's life; a failure isn't kept, so the next mount retries.
const latest = new Map()
function latestRate(from, to) {
  const key = `${from}:${to}:${today()}`
  if (!latest.has(key)) {
    latest.set(key, getRate(from, to).then((answer) => {
      if (!answer) latest.delete(key)
      return answer
    }))
  }
  return latest.get(key)
}

const NO_RATES = {}

// The latest ECB rates for `currencies` (ruleFx.foreignCurrencies) into
// `base`, for totals built from recurring rules: { rates: { PLN: 0.2327, … },
// loading }. A currency with no rate (offline, unknown) is simply absent —
// never 1.
export function useLatestRates(currencies, base) {
  const wanted = base ? [...new Set(currencies)].filter((c) => c !== base).sort().join(',') : ''
  const key = wanted && `${wanted}>${base}`
  const [state, setState] = useState({ key: '', rates: {} })

  useEffect(() => {
    if (!key) return undefined
    let live = true
    const list = wanted.split(',')
    Promise.all(list.map((c) => latestRate(c, base))).then((answers) => {
      if (!live) return
      const rates = {}
      list.forEach((c, i) => { if (answers[i]) rates[c] = answers[i].rate })
      setState({ key, rates })
    })
    return () => { live = false }
  }, [key, wanted, base])

  if (!key) return { rates: NO_RATES, loading: false }
  return state.key === key ? { rates: state.rates, loading: false } : { rates: NO_RATES, loading: true }
}
