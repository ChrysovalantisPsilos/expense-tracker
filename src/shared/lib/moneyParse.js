// Normalise free-typed money input to a raw numeric string ("1234.56").
// Both "," and "." are accepted as the decimal separator — many locales'
// mobile keypads only offer a comma. Pasted values with both separators
// ("1,234.56" / "1.234,56") parse by "last separator wins". Pure module.
export function sanitizeAmountInput(input) {
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
