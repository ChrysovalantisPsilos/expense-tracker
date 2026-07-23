import { Input } from '@chakra-ui/react'
import { sanitizeAmountInput } from '../lib/moneyParse.js'

// Controlled money field. `value` is the raw numeric string ("1234.56") that
// callers pass straight to toMinor(); `onChange(raw)` receives the same.
//
// Mobile keyboards decide the pain here: with inputMode="decimal", many
// locales' keypads (Greek, German, French…) only offer a COMMA as the decimal
// key. sanitizeAmountInput accepts both separators; no thousands grouping is
// rendered — grouping commas and decimal commas are indistinguishable on
// input, and losing the decimal key made amounts like 5,50 silently become 550.
export default function MoneyInput({ value, onChange, ...props }) {
  return (
    <Input
      inputMode="decimal"
      value={value ?? ''}
      onChange={(e) => onChange(sanitizeAmountInput(e.target.value))}
      placeholder="0.00"
      {...props}
    />
  )
}
