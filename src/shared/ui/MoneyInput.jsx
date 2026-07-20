import { Input } from '@chakra-ui/react'

// Groups the integer part with commas, keeps up to 2 decimals. Operates on a
// raw numeric string (no separators) so callers can pass it straight to
// toMinor(). Cursor moves to the end on reformat — fine for amount entry.
function formatGrouped(raw) {
  if (raw == null || raw === '') return ''
  const [int, dec] = String(raw).split('.')
  const grouped = (int || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return dec !== undefined ? `${grouped}.${dec}` : grouped
}

function sanitize(input) {
  let raw = input.replace(/,/g, '').replace(/[^\d.]/g, '')
  const parts = raw.split('.')
  if (parts.length > 2) raw = parts[0] + '.' + parts.slice(1).join('')
  const [int, dec] = raw.split('.')
  if (dec !== undefined) raw = int + '.' + dec.slice(0, 2)
  return raw
}

// Controlled money field. `value` is the raw numeric string; `onChange(raw)`.
export default function MoneyInput({ value, onChange, ...props }) {
  return (
    <Input
      inputMode="decimal"
      value={formatGrouped(value)}
      onChange={(e) => onChange(sanitize(e.target.value))}
      placeholder="0.00"
      {...props}
    />
  )
}
