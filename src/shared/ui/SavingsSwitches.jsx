import { useId } from 'react'
import { FormControl, FormHelperText, FormLabel, HStack, Switch } from '@chakra-ui/react'

// The two savings switches the transaction form and the recurring-entry form
// show (the rule: supabase/functions/_shared/savings.ts).
function FlagSwitch({ label, hint, value, onChange }) {
  const id = useId()
  return (
    <FormControl>
      <HStack justify="space-between" spacing={4}>
        <FormLabel htmlFor={id} mb={0}>{label}</FormLabel>
        <Switch id={id} isChecked={value} onChange={(e) => onChange(e.target.checked)} />
      </HStack>
      <FormHelperText>{hint}</FormHelperText>
    </FormControl>
  )
}

// "Taken from my income" on a savings entry (0084). On: set aside from salary
// or income, so it lowers Home's Net. Off: money received (a gift, interest);
// the Net is unchanged. Either way it's savings, never income.
export function SavingsSourceSwitch({ value, onChange }) {
  return (
    <FlagSwitch label="Taken from my income" value={value} onChange={onChange}
      hint="On: lowers your Net on Home. Off: money you received, like a gift or interest." />
  )
}

// "Paid from savings" on an expense (0085). On: it's still spending, but it
// comes out of the savings pot, so it doesn't lower Home's Net.
export function PaidFromSavingsSwitch({ value, onChange }) {
  return (
    <FlagSwitch label="Paid from savings" value={value} onChange={onChange}
      hint="On: comes out of your savings, not this month’s income." />
  )
}
