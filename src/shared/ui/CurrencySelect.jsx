import { Select } from '@chakra-ui/react'
import { CURRENCIES } from '../lib/currency.js'

// The currency dropdown: the supported ISO codes, plus `include` first when
// it isn't one of them (a group's own currency). `onChange` gets the code;
// other props (id, placeholder, aria-label…) go to the Select.
export default function CurrencySelect({ value, onChange, include, ...rest }) {
  const codes = include && !CURRENCIES.includes(include) ? [include, ...CURRENCIES] : CURRENCIES
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} {...rest}>
      {codes.map((c) => <option key={c} value={c}>{c}</option>)}
    </Select>
  )
}
