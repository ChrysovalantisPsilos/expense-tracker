// Currency helpers. Money is stored as integer minor units (cents).

// Supported currencies (EUR first — it's the app default).
export const CURRENCIES = ['EUR', 'USD', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD']

// Most currencies have 2 decimal places; a few (JPY, KRW…) have 0.
const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'CLP'])
export function minorFactor(currency = 'EUR') {
  return ZERO_DECIMAL.has(currency) ? 1 : 100
}

export function toMinor(amount, currency = 'EUR') {
  return Math.round(Number(amount) * minorFactor(currency))
}

export function fromMinor(minor, currency = 'EUR') {
  return Number(minor) / minorFactor(currency)
}

export function formatMoney(minor, currency = 'EUR', locale = undefined) {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(
    fromMinor(minor, currency),
  )
}

// Convert a minor amount to the user's base currency using the rate captured
// at entry time (never today's rate — that would rewrite history). The rate is
// major-per-major, so we scale by the decimal-factor ratio to stay correct when
// the source and base currencies have different decimal places (e.g. JPY↔EUR).
export function toBaseMinor(minor, exchangeRate, fromCurrency = 'EUR', baseCurrency = 'EUR') {
  return Math.round(
    Number(minor) * Number(exchangeRate) * minorFactor(baseCurrency) / minorFactor(fromCurrency),
  )
}

// Fetch a daily FX rate from base->quote. Cached in localStorage per day so we
// don't hammer the API. Returns 1 on failure (caller can flag as unconverted).
// Optional chaining: import.meta.env only exists under Vite — this module is
// also imported by the plain-node unit tests.
const FX_BASE = import.meta.env?.VITE_FX_API_URL || 'https://api.exchangerate.host'

export async function getRate(from, to) {
  if (from === to) return 1
  const today = new Date().toISOString().slice(0, 10)
  const key = `fx:${from}:${to}:${today}`
  const cached = localStorage.getItem(key)
  if (cached) return Number(cached)
  try {
    const res = await fetch(`${FX_BASE}/convert?from=${from}&to=${to}&amount=1`)
    const json = await res.json()
    const rate = json?.result ?? json?.info?.rate ?? 1
    localStorage.setItem(key, String(rate))
    return Number(rate)
  } catch {
    return 1
  }
}
