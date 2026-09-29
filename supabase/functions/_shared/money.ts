// Shared money helpers for the edge functions and the client. Money is integer
// minor units; zero-decimal currencies (ISO 4217: JPY/KRW/ISK, plus legacy
// VND/CLP) have no fractional part; HUF and IDR keep 2. The zero-decimal set
// is kept in lockstep with the client's currency.js and SQL minor_factor
// (test/edgeShared.test.js checks all three). toBaseMinor is the one copy: the
// client re-exports it from src/shared/lib/currency.js.

// Supported currencies: every currency the ECB publishes a daily reference
// rate for (so each one can be converted to any other), EUR first — it's the
// app default — then the most common travel currencies, then A–Z.
export const CURRENCIES: readonly string[] = [
  'EUR', 'USD', 'GBP', 'CHF', 'JPY',
  'AUD', 'BRL', 'CAD', 'CNY', 'CZK', 'DKK', 'HKD', 'HUF', 'IDR', 'ILS',
  'INR', 'ISK', 'KRW', 'MXN', 'MYR', 'NOK', 'NZD', 'PHP', 'PLN', 'RON',
  'SEK', 'SGD', 'THB', 'TRY', 'ZAR',
]

export const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'ISK', 'VND', 'CLP'])

export const minorFactor = (currency: string): number =>
  (ZERO_DECIMAL.has(currency) ? 1 : 100)

// "12.34 EUR" — plain amount + ISO code (statements/reports/tables).
export function fmtMinor(minor: number, currency: string): string {
  const factor = minorFactor(currency)
  const v = (minor / factor).toFixed(factor === 1 ? 0 : 2)
  return `${v} ${currency}`
}

// Convert a minor amount to the user's base currency using the rate captured
// at entry time (never today's rate — that would rewrite history). The rate is
// major-per-major, so we scale by the decimal-factor ratio to stay correct when
// the source and base currencies have different decimal places (e.g. JPY↔EUR).
//
// Exact integer arithmetic, rounding half away from zero — the same answer as
// SQL public.to_base_minor (numeric round). Floats get ties wrong: ¥275 at
// 0.0062 is €1.705, which float maths rounds to €1.70 and SQL to €1.71. A group
// expense's split is checked against the server's number, so they must agree.
// Rates are stored as numeric(18, 8), i.e. at most 8 decimals.
const RATE_SCALE = 100000000n
export function toBaseMinor(
  minor: number | string, exchangeRate: number | string | null, fromCurrency = 'EUR', baseCurrency = 'EUR',
): number {
  const m = Number(minor)
  const r = Math.round(Number(exchangeRate) * 1e8)
  if (!Number.isSafeInteger(m) || !Number.isSafeInteger(r)) {
    return Math.round(m * Number(exchangeRate) * minorFactor(baseCurrency) / minorFactor(fromCurrency))
  }
  const num = BigInt(Math.abs(m)) * BigInt(Math.abs(r)) * BigInt(minorFactor(baseCurrency))
  const den = RATE_SCALE * BigInt(minorFactor(fromCurrency))
  const q = Number((2n * num + den) / (2n * den))
  return q !== 0 && (m < 0) !== (r < 0) ? -q : q
}
