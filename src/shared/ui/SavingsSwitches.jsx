import { useId } from 'react'
import { FormControl, FormLabel, HStack, Switch, Text } from '@chakra-ui/react'
import SegmentedControl from './SegmentedControl.jsx'
import { InfoBox, InfoButton, useInfoToggle } from './InfoToggle.jsx'
import { useT } from '../lib/i18n/I18nProvider.jsx'

// The savings choices the transaction form and the recurring-entry form show
// (the rule: supabase/functions/_shared/savings.ts). What each one means sits
// behind an ⓘ beside its label.

// "Taken from my income" on a savings entry (0084). On: set aside from salary
// or income, so it lowers Home's Net. Off: money received (a gift, interest);
// the Net is unchanged. Either way it's savings, never income.
export function SavingsSourceSwitch({ value, onChange }) {
  const t = useT()
  const id = useId()
  const info = useInfoToggle()
  return (
    <FormControl>
      <HStack justify="space-between" spacing={4}>
        <HStack spacing={0.5}>
          <FormLabel htmlFor={id} mb={0} mr={0}>{t('savingsSwitch.fromIncome.label')}</FormLabel>
          <InfoButton info={info} label={t('info')} />
        </HStack>
        <Switch id={id} isChecked={value} onChange={(e) => onChange(e.target.checked)} />
      </HStack>
      <InfoBox info={info}><Text>{t('savingsSwitch.fromIncome.hint')}</Text></InfoBox>
    </FormControl>
  )
}

// "Paid from" on an expense: Bank, Savings (0085) or Meal vouchers (0097).
// Savings and vouchers are still spending, but they come out of the savings
// pot or the voucher card, so they don't lower Home's Net. `sources` lists
// the choices the user has (bank always first); `value` is one of them.
export function PaidFromChoice({ sources, value, onChange }) {
  const t = useT()
  const info = useInfoToggle()
  return (
    <FormControl as="fieldset">
      <HStack spacing={0.5} mb={2}>
        <FormLabel as="legend" mb={0} mr={0}>{t('paidFrom.label')}</FormLabel>
        <InfoButton info={info} label={t('info')} />
      </HStack>
      <SegmentedControl size="sm" isFitted label={t('paidFrom.label')} value={value} onChange={onChange}
        options={sources.map((s) => [s, t(`paidFrom.${s}`)])} />
      <InfoBox info={info}>
        {sources.map((s) => <Text key={s}>{t(`paidFrom.${s}Info`)}</Text>)}
      </InfoBox>
    </FormControl>
  )
}

