// Currency helpers. Money is stored as integer minor units (cents).

export function toMinor(amount, currency = 'USD') {
  // Most currencies have 2 decimal places; a few (JPY, KRW) have 0.
  const zeroDecimal = ['JPY', 'KRW', 'VND', 'CLP']
  const factor = zeroDecimal.includes(currency) ? 1 : 100
  return Math.round(Number(amount) * factor)
}

export function fromMinor(minor, currency = 'USD') {
  const zeroDecimal = ['JPY', 'KRW', 'VND', 'CLP']
  const factor = zeroDecimal.includes(currency) ? 1 : 100
  return Number(minor) / factor
}

export function formatMoney(minor, currency = 'USD', locale = undefined) {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(
    fromMinor(minor, currency),
  )
}

// Convert a minor amount to the user's base currency using the rate captured
// at entry time (never today's rate — that would rewrite history).
export function toBaseMinor(minor, exchangeRate) {
  return Math.round(minor * Number(exchangeRate))
}

// Fetch a daily FX rate from base->quote. Cached in localStorage per day so we
// don't hammer the API. Returns 1 on failure (caller can flag as unconverted).
const FX_BASE = import.meta.env.VITE_FX_API_URL || 'https://api.exchangerate.host'

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
