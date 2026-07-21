import { Input } from '@chakra-ui/react'

// Controlled money field. `value` is the raw numeric string ("1234.56") that
// callers pass straight to toMinor(); `onChange(raw)` receives the same.
//
// Mobile keyboards decide the pain here: with inputMode="decimal", many
// locales' keypads (Greek, German, French…) only offer a COMMA as the decimal
// key. So both "," and "." are accepted as the decimal separator, and no
// thousands grouping is rendered — grouping commas and decimal commas are
// indistinguishable on input, and losing the decimal key made amounts like
// 5,50 silently become 550.
function sanitize(input) {
  let raw = input
  if (raw.includes(',') && raw.includes('.')) {
    // Pasted with both separators ("1,234.56" / "1.234,56"): whichever comes
    // last is the decimal point, the other is grouping.
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

export default function MoneyInput({ value, onChange, ...props }) {
  return (
    <Input
      inputMode="decimal"
      value={value ?? ''}
      onChange={(e) => onChange(sanitize(e.target.value))}
      placeholder="0.00"
      {...props}
    />
  )
}
