import {
  FormControl, FormHelperText, FormLabel, HStack, Input, NumberInput, NumberInputField, Select, Stack,
  Switch, Text, useToast,
} from '@chakra-ui/react'
import { Bell, Repeat } from 'lucide-react'
import Panel from '../../shared/ui/kit/Panel.jsx'
import OptionalDate from '../../shared/ui/OptionalDate.jsx'
import { enablePush } from '../../shared/lib/push.js'
import { useProfile } from '../../shared/lib/ProfileProvider.jsx'
import { repeatChoiceOptions, repeatShareLine } from './recurringMath.js'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

// The Repeat section under an entry's fields (EntryFields): the card with its
// title, `subtitle` and — on Add — the switch that turns it on or off
// (`isOn`/`onToggle`). Without `onToggle` it's always on and has no switch: a
// recurring rule's page, where the entry is the rule. `children` are its
// contents (RepeatFields, and any note).
export function RepeatPanel({ subtitle, isOn = true, onToggle, children }) {
  const t = useT('transactions')
  return (
    <Panel icon={Repeat} title={t('form.repeat.title')} subtitle={subtitle}
      action={onToggle && (
        <Switch id="repeat-switch" isChecked={isOn} onChange={(e) => onToggle(e.target.checked)}
          aria-label={t('form.repeat.title')} />
      )}>
      {children}
    </Panel>
  )
}

// The schedule of a recurring rule — how often, every N, next charge (unless
// `showNext` is off: a rule's page has it among the entry's fields), end date,
// reminder, and (with `pausable`) paused — inside the Repeat section on Add and
// on a rule's page. Controlled: `value` is a repeatDraft (recurringMath.js)
// and `onChange(changes)` reports a partial update for the parent to apply
// with editRepeat. `nextHelp` sits under the next-charge date.
// `kind`/`amountMinor`/`currency` show how a yearly expense counts in monthly
// budgets.
export default function RepeatFields({
  value: d, onChange, nextHelp, showNext = true, pausable = false, kind, amountMinor, currency,
}) {
  const t = useT('recurring')
  const toast = useToast()
  const { separateYearly } = useProfile()
  // A yearly expense counts evenly in each month's budgets (spread.js), unless
  // the user keeps yearly subscriptions out of monthly spending (Settings).
  const share = repeatShareLine({ choice: d.choice, n: d.n, kind, amountMinor, currency, separateYearly })

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
        toast({ title: t('repeat.push.blocked'), status: 'info', description: t('repeat.push.blockedText') })
      } else if (status === 'unsupported') {
        toast({ title: t('repeat.push.unsupported'), status: 'info', description: t('repeat.push.unsupportedText') })
      }
    } catch {
      toast({ title: t('repeat.push.failed'), status: 'warning', description: t('repeat.push.failedText') })
    }
  }

  return (
    <Stack spacing={4}>
      <HStack align="end" spacing={3}>
        <FormControl flex="1">
          <FormLabel>{t('repeat.howOften')}</FormLabel>
          <Select value={d.choice} onChange={(e) => onChange({ choice: e.target.value })}>
            {repeatChoiceOptions().map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </Select>
        </FormControl>
        {d.choice !== 'quarterly' && (
          <FormControl w="auto" flexShrink={0}>
            <FormLabel>{t('repeat.every')}</FormLabel>
            <HStack spacing={2}>
              <NumberInput min={1} maxW="80px" value={d.n} onChange={(v) => onChange({ n: v })}>
                <NumberInputField aria-label={t(`repeat.everyHowMany.${d.choice}`)} />
              </NumberInput>
              <Text fontSize="sm" color="text.muted">{t(`repeat.units.${d.choice}`)}</Text>
            </HStack>
          </FormControl>
        )}
      </HStack>
      {share && (
        <Text fontSize="sm" color="text.muted" mt={-2}>{share}</Text>
      )}

      {showNext && (
        <FormControl>
          <FormLabel>{t('repeat.nextCharge')}</FormLabel>
          <Input type="date" value={d.nextRun} onChange={(e) => onChange({ nextRun: e.target.value })} />
          {nextHelp && <FormHelperText>{nextHelp}</FormHelperText>}
        </FormControl>
      )}

      <FormControl>
        <OptionalDate label={t('repeat.endDate')} value={d.endDate} onChange={(v) => onChange({ endDate: v })} />
      </FormControl>

      <FormControl>
        <HStack justify="space-between">
          <FormLabel mb={0} htmlFor="repeat-remind">
            <HStack spacing={2}>
              <Bell size={15} aria-hidden />
              <Text>{t('repeat.remind')}</Text>
            </HStack>
          </FormLabel>
          <Switch id="repeat-remind" isChecked={d.remind} onChange={toggleRemind} />
        </HStack>
        {d.remind && (
          <HStack mt={3} spacing={2}>
            <NumberInput min={1} max={60} maxW="90px" value={d.remindDays}
              onChange={(v) => onChange({ remindDays: v })}>
              <NumberInputField aria-label={t('repeat.remindDays')} />
            </NumberInput>
            <Text fontSize="sm" color="text.muted">{t('repeat.daysBefore')}</Text>
          </HStack>
        )}
      </FormControl>

      {pausable && (
        <FormControl>
          <HStack justify="space-between">
            <FormLabel mb={0} htmlFor="repeat-paused">{t('repeat.paused')}</FormLabel>
            <Switch id="repeat-paused" isChecked={!d.active}
              onChange={(e) => onChange({ active: !e.target.checked })} />
          </HStack>
          <FormHelperText>{t('repeat.pausedHelp')}</FormHelperText>
        </FormControl>
      )}
    </Stack>
  )
}
