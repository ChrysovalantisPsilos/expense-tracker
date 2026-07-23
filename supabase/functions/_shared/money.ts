// Shared money formatting for the edge functions. Money is integer minor units;
// zero-decimal currencies (JPY/KRW/VND/CLP) have no fractional part. Kept in one
// place so every server-rendered amount matches the client's currency.js.

export const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'CLP'])

export const minorFactor = (currency: string): number =>
  (ZERO_DECIMAL.has(currency) ? 1 : 100)

// "12.34 EUR" — plain amount + ISO code (statements/reports/tables).
export function fmtMinor(minor: number, currency: string): string {
  const factor = minorFactor(currency)
  const v = (minor / factor).toFixed(factor === 1 ? 0 : 2)
  return `${v} ${currency}`
}

// "€12.34" with a symbol when we have one, else "12.34 EUR" (reminders/emails).
export function moneySymbol(minor: number, currency: string): string {
  const factor = minorFactor(currency)
  const amount = (minor / factor).toLocaleString('en-US', {
    minimumFractionDigits: factor === 1 ? 0 : 2,
    maximumFractionDigits: factor === 1 ? 0 : 2,
  })
  const symbol = ({ EUR: '€', USD: '$', GBP: '£', JPY: '¥' } as Record<string, string>)[currency]
  return symbol ? `${symbol}${amount}` : `${amount} ${currency}`
}
