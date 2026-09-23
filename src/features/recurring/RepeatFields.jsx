import {
  FormControl, FormHelperText, FormLabel, HStack, Input, NumberInput, NumberInputField, Select, Stack,
  Switch, Text, useToast,
} from '@chakra-ui/react'
import { Bell } from 'lucide-react'
import OptionalDate from '../../shared/ui/OptionalDate.jsx'
import { enablePush } from '../../shared/lib/push.js'
import { formatMoney } from '../../shared/lib/currency.js'
import { useProfile } from '../../shared/lib/ProfileProvider.jsx'
import { REPEAT_CHOICES, choiceToRule, monthlyBudgetShare } from './recurringMath.js'

const UNIT = { daily: 'days', weekly: 'weeks', monthly: 'months', yearly: 'years' }

// The schedule of a recurring rule — how often, every N, next charge, end
// date, reminder, and (with `pausable`) paused — shared by the transaction
// page's Repeat section and the recurring-entry form. Controlled: `value` is a
// repeatDraft (recurringMath.js) and `onChange(changes)` reports a partial
// update for the parent to apply with editRepeat. `nextHelp` sits under the
// next-charge date. `kind`/`amountMinor`/`currency` show how a yearly expense
// counts in monthly budgets. `idPrefix` keeps the switches' ids unique.
export default function RepeatFields({
  value: d, onChange, nextHelp, pausable = false, kind, amountMinor, currency, idPrefix = 'repeat',
}) {
  const toast = useToast()
  const { separateYearly } = useProfile()
  const { frequency, interval_n } = choiceToRule(d.choice, d.n)
  // A yearly expense counts evenly in each month's budgets (spread.js), unless
  // the user keeps yearly subscriptions out of monthly spending (Settings).
  const share = amountMinor > 0 && !separateYearly
    ? monthlyBudgetShare({ kind, frequency, interval_n, amount_minor: amountMinor }) : null

  // Enrol this device for push the moment reminders are switched on — the
  // flip is the user gesture iOS needs for the permission prompt. A refusal
  // isn't fatal: reminders still land in the app's notification bell.
  async function toggleRemind(e) {
    const on = e.target.checked
    onChange({ remind: on })
    if (!on) return
    try {
      const status = await enablePush()
      if (status === 'denied') {
        toast({ title: 'Push blocked', status: 'info',
          description: 'Reminders will show in the app’s notification bell instead.' })
      } else if (status === 'unsupported') {
        toast({ title: 'Push isn’t available in this browser', status: 'info',
          description: 'On iPhone, install Budgeer to your home screen first. Reminders will still show in the bell.' })
      }
    } catch {
      toast({ title: 'Couldn’t enable push on this device', status: 'warning',
        description: 'Reminders will show in the app’s notification bell.' })
    }
  }

  return (
    <Stack spacing={4}>
      <HStack align="end" spacing={3}>
        <FormControl flex="1">
          <FormLabel>How often</FormLabel>
          <Select value={d.choice} onChange={(e) => onChange({ choice: e.target.value })}>
            {REPEAT_CHOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </FormControl>
        {d.choice !== 'quarterly' && (
          <FormControl w="auto" flexShrink={0}>
            <FormLabel>Every</FormLabel>
            <HStack spacing={2}>
              <NumberInput min={1} maxW="80px" value={d.n} onChange={(v) => onChange({ n: v })}>
                <NumberInputField aria-label={`Every how many ${UNIT[d.choice]}`} />
              </NumberInput>
              <Text fontSize="sm" color="text.muted">{UNIT[d.choice]}</Text>
            </HStack>
          </FormControl>
        )}
      </HStack>
      {share && (
        <Text fontSize="sm" color="text.muted" mt={-2}>
          {`Counts as ${share.exact ? '' : 'about '}${formatMoney(share.perMonth, currency)}/month in budgets, spread over ${share.months} months.`}
        </Text>
      )}

      <FormControl>
        <FormLabel>Next charge</FormLabel>
        <Input type="date" value={d.nextRun} onChange={(e) => onChange({ nextRun: e.target.value })} />
        {nextHelp && <FormHelperText>{nextHelp}</FormHelperText>}
      </FormControl>

      <FormControl>
        <OptionalDate label="Set an end date" value={d.endDate} onChange={(v) => onChange({ endDate: v })} />
      </FormControl>

      <FormControl>
        <HStack justify="space-between">
          <FormLabel mb={0} htmlFor={`${idPrefix}-remind`}>
            <HStack spacing={2}>
              <Bell size={15} aria-hidden />
              <Text>Remind me before each charge</Text>
            </HStack>
          </FormLabel>
          <Switch id={`${idPrefix}-remind`} isChecked={d.remind} onChange={toggleRemind} />
        </HStack>
        {d.remind && (
          <HStack mt={3} spacing={2}>
            <NumberInput min={1} max={60} maxW="90px" value={d.remindDays}
              onChange={(v) => onChange({ remindDays: v })}>
              <NumberInputField aria-label="Days before each charge" />
            </NumberInput>
            <Text fontSize="sm" color="text.muted">days before, via notification</Text>
          </HStack>
        )}
      </FormControl>

      {pausable && (
        <FormControl>
          <HStack justify="space-between">
            <FormLabel mb={0} htmlFor={`${idPrefix}-paused`}>Paused</FormLabel>
            <Switch id={`${idPrefix}-paused`} isChecked={!d.active}
              onChange={(e) => onChange({ active: !e.target.checked })} />
          </HStack>
          <FormHelperText>No new charges are added while it’s paused.</FormHelperText>
        </FormControl>
      )}
    </Stack>
  )
}
