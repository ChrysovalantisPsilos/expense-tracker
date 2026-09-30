import { forwardRef } from 'react'
import { Input } from '@chakra-ui/react'
import { amountFieldHints, sanitizeAmountInput, sanitizeSignedAmountInput } from '../lib/moneyParse.js'

// Controlled money field. `value` is the raw numeric string ("1234.56") that
// callers pass straight to toMinor(); `onChange(raw)` receives the same.
//
// Mobile keyboards decide the pain here: with inputMode="decimal", many
// locales' keypads (Greek, German, French…) only offer a COMMA as the decimal
// key. sanitizeAmountInput accepts both separators; no thousands grouping is
// rendered — grouping commas and decimal commas are indistinguishable on
// input, and losing the decimal key made amounts like 5,50 silently become 550.
// `currency` is the amount's currency: a zero-decimal one (JPY, KRW…) takes
// whole numbers only, reading "," and "." as grouping. Leave it out for a
// field that isn't money in one currency (a percentage, a share weight).
// `allowNegative` keeps a leading minus (balances that can be overdrawn).
// The placeholder writes the app language's decimal mark (0.00, Greek 0,00).
// Forwards its ref (e.g. to focus the field).
export default forwardRef(function MoneyInput({ value, onChange, currency, allowNegative = false, ...props }, ref) {
  const sanitize = allowNegative ? sanitizeSignedAmountInput : sanitizeAmountInput
  const { whole, placeholder } = amountFieldHints(currency)
  return (
    <Input
      ref={ref}
      inputMode={whole ? 'numeric' : 'decimal'}
      value={value ?? ''}
      onChange={(e) => onChange(sanitize(e.target.value, currency))}
      placeholder={placeholder}
      {...props}
    />
  )
})
