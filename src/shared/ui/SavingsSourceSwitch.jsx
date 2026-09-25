import { useId } from 'react'
import { FormControl, FormHelperText, FormLabel, HStack, Switch } from '@chakra-ui/react'

// "Taken from my income" on a savings entry (0084) — the transaction form and
// the recurring-entry form. On: set aside from salary or income, so it lowers
// Home's Net. Off: money received (a gift, interest); the Net is unchanged.
// Either way it's savings, never income.
export default function SavingsSourceSwitch({ value, onChange }) {
  const id = useId()
  return (
    <FormControl>
      <HStack justify="space-between" spacing={4}>
        <FormLabel htmlFor={id} mb={0}>Taken from my income</FormLabel>
        <Switch id={id} isChecked={value} onChange={(e) => onChange(e.target.checked)} />
      </HStack>
      <FormHelperText>On: lowers your Net on Home. Off: money you received, like a gift or interest.</FormHelperText>
    </FormControl>
  )
}
