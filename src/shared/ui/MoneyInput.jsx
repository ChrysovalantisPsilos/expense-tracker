import { forwardRef } from 'react'
import { Input } from '@chakra-ui/react'
import { sanitizeAmountInput, sanitizeSignedAmountInput } from '../lib/moneyParse.js'

// Controlled money field. `value` is the raw numeric string ("1234.56") that
// callers pass straight to toMinor(); `onChange(raw)` receives the same.
//
// Mobile keyboards decide the pain here: with inputMode="decimal", many
// locales' keypads (Greek, German, French…) only offer a COMMA as the decimal
// key. sanitizeAmountInput accepts both separators; no thousands grouping is
// rendered — grouping commas and decimal commas are indistinguishable on
// input, and losing the decimal key made amounts like 5,50 silently become 550.
// `allowNegative` keeps a leading minus (balances that can be overdrawn).
// Forwards its ref (e.g. to focus the field).
export default forwardRef(function MoneyInput({ value, onChange, allowNegative = false, ...props }, ref) {
  const sanitize = allowNegative ? sanitizeSignedAmountInput : sanitizeAmountInput
  return (
    <Input
      ref={ref}
      inputMode="decimal"
      value={value ?? ''}
      onChange={(e) => onChange(sanitize(e.target.value))}
      placeholder="0.00"
      {...props}
    />
  )
})
