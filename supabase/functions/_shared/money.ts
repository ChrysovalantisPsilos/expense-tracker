// Shared money formatting for the edge functions. Money is integer minor units;
// zero-decimal currencies (ISO 4217: JPY/KRW/ISK, plus legacy VND/CLP) have no
// fractional part; HUF and IDR keep 2. Kept in lockstep with the client's
// currency.js and SQL minor_factor (test/edgeShared.test.js checks all three).

export const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'ISK', 'VND', 'CLP'])

export const minorFactor = (currency: string): number =>
  (ZERO_DECIMAL.has(currency) ? 1 : 100)

// "12.34 EUR" — plain amount + ISO code (statements/reports/tables).
export function fmtMinor(minor: number, currency: string): string {
  const factor = minorFactor(currency)
  const v = (minor / factor).toFixed(factor === 1 ? 0 : 2)
  return `${v} ${currency}`
}
