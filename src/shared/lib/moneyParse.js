import { minorFactor } from './currency.js'
import { intlLocale } from './i18n/i18n.js'

// Normalise free-typed money input to a raw numeric string ("1234.56").
// Both "," and "." are accepted as the decimal separator — many locales'
// mobile keypads only offer a comma. Pasted values with both separators
// ("1,234.56" / "1.234,56") parse by "last separator wins". Pure module.
//
// A zero-decimal currency (JPY, KRW, ISK…) has no decimal part, so there both
// "," and "." can only be grouping: "1,500" and "1.500" are 1500, never ¥2,
// and no fraction is kept for toMinor to round away. `currency` omitted means
// a two-decimal field (also used for percentages and share weights).
export function sanitizeAmountInput(input, currency) {
  if (currency && minorFactor(currency) === 1) return String(input).replace(/\D/g, '')
  let raw = input
  if (raw.includes(',') && raw.includes('.')) {
    raw = raw.lastIndexOf(',') > raw.lastIndexOf('.')
      ? raw.replace(/\./g, '').replace(/,/g, '.')
      : raw.replace(/,/g, '')
  } else {
    raw = raw.replace(/,/g, '.')
  }
  raw = raw.replace(/[^\d.]/g, '')
  const parts = raw.split('.')
  if (parts.length > 2) raw = parts[0] + '.' + parts.slice(1).join('')
  const [int, dec] = raw.split('.')
  if (dec !== undefined) raw = int + '.' + dec.slice(0, 2)
  return raw
}

// sanitizeAmountInput for fields that may go below zero (e.g. an overdrawn
// account balance): a leading "-" (or "−") is kept, anything else as above.
export function sanitizeSignedAmountInput(input, currency) {
  const negative = /^\s*[-−]/.test(input)
  return (negative ? '-' : '') + sanitizeAmountInput(input, currency)
}

// How a money field in `currency` asks for its amount: `whole` for a
// zero-decimal currency (a numeric keypad, "0"), else the decimal keypad and
// a placeholder with the app language's decimal mark (0.00, Greek 0,00).
export function amountFieldHints(currency) {
  const whole = !!currency && minorFactor(currency) === 1
  return { whole, placeholder: whole ? '0' : (0).toLocaleString(intlLocale('en-US'), { minimumFractionDigits: 2 }) }
}
