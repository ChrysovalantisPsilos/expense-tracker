import { useState } from 'react'
import {
  Stack, HStack, Text, Button, Switch, FormControl, FormHelperText, FormLabel, Input, Select, useToast,
  NumberInput, NumberInputField,
} from '@chakra-ui/react'
import { Bell } from 'lucide-react'
import MoneyInput from '../../shared/ui/MoneyInput.jsx'
import FormModal from '../../shared/ui/FormModal.jsx'
import OptionalDate from '../../shared/ui/OptionalDate.jsx'
import { useCategories } from '../transactions/useData.js'
import { toMinor, fromMinor, formatMoney } from '../../shared/lib/currency.js'
import { today, shortDate } from '../../shared/lib/dates.js'
import { useAsyncSubmit } from '../../shared/lib/useAsyncSubmit.js'
import { enablePush } from '../../shared/lib/push.js'
import { saveRecurring } from './recurring.js'
import { FREQUENCIES, nextRunAfter, monthlyBudgetShare } from './recurringMath.js'

// Add or edit a recurring rule. `rule` edits an existing one; `initial` starts a
// new one pre-filled from a transaction ("Make recurring": ruleFromTransaction
// output plus `from_date`, the transaction's date) — its next charge follows
// the chosen frequency from that date until the user picks a date themselves,
// and saving links the transaction to the rule (source_transaction_id).
export default function RecurringForm({ rule, initial, baseCurrency, onClose, onSaved }) {
  const toast = useToast()
  const isEdit = !!rule
  const init = rule ?? initial
  const [kind, setKind] = useState(init?.kind ?? 'expense')
  const { categories } = useCategories(kind)
  const [amount, setAmount] = useState(init ? String(fromMinor(init.amount_minor, init.currency)) : '')
  const [currency] = useState(init?.currency ?? baseCurrency)
  const [categoryId, setCategoryId] = useState(init?.category_id ?? '')
  const [description, setDescription] = useState(init?.description ?? '')
  const [frequency, setFrequency] = useState(init?.frequency ?? 'monthly')
  const [intervalN, setIntervalN] = useState(String(init?.interval_n ?? 1))
  const [nextRun, setNextRun] = useState(init?.next_run ?? today())
  // From a transaction: the next charge tracks the frequency until edited.
  const [nextTouched, setNextTouched] = useState(!initial?.from_date)
  const follow = (f, n) => {
    if (!nextTouched) setNextRun(nextRunAfter(initial.from_date, f, Math.max(1, parseInt(n, 10) || 1)))
  }
  const [endDate, setEndDate] = useState(rule?.end_date ?? '')
  const [remind, setRemind] = useState(rule?.remind_days_before != null)
  const [remindDays, setRemindDays] = useState(String(rule?.remind_days_before ?? 3))
  const { busy, run } = useAsyncSubmit()
  // A yearly expense counts evenly in each month's budgets (spread.js).
  const share = Number(amount) > 0 ? monthlyBudgetShare({
    kind, frequency, interval_n: parseInt(intervalN, 10) || 1, amount_minor: toMinor(amount, currency),
  }) : null

  // Enrol this device for push the moment reminders are switched on — the
  // flip is the user gesture iOS needs for the permission prompt. A refusal
  // isn't fatal: reminders still land in the app's notification bell.
  async function toggleRemind(e) {
    const on = e.target.checked
    setRemind(on)
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

  async function submit() {
    if (!amount || Number(amount) <= 0) return toast({ title: 'Enter an amount', status: 'warning' })
    await run(async () => {
      await saveRecurring({
        id: rule?.id,
        kind,
        category_id: categoryId || null,
        ...(initial?.account_id ? { account_id: initial.account_id } : {}),
        ...(initial?.source_transaction_id ? { source_transaction_id: initial.source_transaction_id } : {}),
        amount_minor: toMinor(amount, currency),
        currency,
        description: description || null,
        frequency,
        interval_n: Math.max(1, parseInt(intervalN, 10) || 1),
        next_run: nextRun,
        end_date: endDate || null,
        is_active: rule?.is_active ?? true,
        remind_days_before: remind
          ? Math.min(60, Math.max(1, parseInt(remindDays, 10) || 3))
          : null,
      })
      toast({ title: isEdit ? 'Recurring entry updated' : 'Recurring entry added', status: 'success' })
      onSaved()
    })
  }

  return (
    <FormModal isOpen onClose={onClose} scrollBehavior="inside" onSubmit={submit} busy={busy}
      title={isEdit ? 'Edit recurring entry' : initial ? 'Make recurring' : 'New recurring entry'}
      submitLabel={isEdit ? 'Save' : 'Add'}>
      <Stack spacing={4}>
        <HStack spacing={2}>
          <Button flex="1" variant={kind === 'expense' ? 'solid' : 'outline'}
            colorScheme={kind === 'expense' ? 'brand' : 'gray'}
            onClick={() => { setKind('expense'); setCategoryId('') }}>Expense</Button>
          <Button flex="1" variant={kind === 'income' ? 'solid' : 'outline'}
            colorScheme={kind === 'income' ? 'brand' : 'gray'}
            onClick={() => { setKind('income'); setCategoryId('') }}>Income</Button>
        </HStack>

        <FormControl isRequired>
          <FormLabel>Description</FormLabel>
          <Input value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder={kind === 'income' ? 'Salary' : 'Netflix, rent, gym…'} />
        </FormControl>

        <FormControl isRequired>
          <FormLabel>Amount ({currency})</FormLabel>
          <MoneyInput value={amount} onChange={setAmount} />
        </FormControl>

        <FormControl>
          <FormLabel>Category</FormLabel>
          <Select placeholder="Uncategorized" value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </FormControl>

        <HStack align="end">
          <FormControl maxW="120px">
            <FormLabel>Every</FormLabel>
            <NumberInput min={1} value={intervalN}
              onChange={(v) => { setIntervalN(v); follow(frequency, v) }}>
              <NumberInputField />
            </NumberInput>
          </FormControl>
          <FormControl>
            <FormLabel>Frequency</FormLabel>
            <Select value={frequency}
              onChange={(e) => { setFrequency(e.target.value); follow(e.target.value, intervalN) }}>
              {FREQUENCIES.map((f) => (
                <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>
              ))}
            </Select>
          </FormControl>
        </HStack>
        {share && (
          <Text fontSize="sm" color="text.muted" mt={-2}>
            {`Counts as ${share.exact ? '' : 'about '}${formatMoney(share.perMonth, currency)}/month in budgets, spread over ${share.months} months.`}
          </Text>
        )}

        <FormControl>
          <FormLabel>Next charge</FormLabel>
          <Input type="date" value={nextRun}
            onChange={(e) => { setNextRun(e.target.value); setNextTouched(true) }} />
          {initial?.from_date && (
            <FormHelperText>
              {`The entry on ${shortDate(initial.from_date)} counts as the first one.`}
              {!isEdit && nextRun < today() && ' Charges from then until today are added automatically tonight.'}
            </FormHelperText>
          )}
        </FormControl>
        <FormControl>
          <OptionalDate label="Set an end date" value={endDate} onChange={setEndDate} />
        </FormControl>

        <FormControl>
          <HStack justify="space-between">
            <FormLabel mb={0} htmlFor="remind-switch">
              <HStack spacing={2}>
                <Bell size={15} />
                <Text>Remind me before each charge</Text>
              </HStack>
            </FormLabel>
            <Switch id="remind-switch" isChecked={remind} onChange={toggleRemind} />
          </HStack>
          {remind && (
            <HStack mt={3} spacing={2}>
              <NumberInput min={1} max={60} maxW="90px" value={remindDays}
                onChange={setRemindDays}>
                <NumberInputField />
              </NumberInput>
              <Text fontSize="sm" color="text.muted">days before, via notification</Text>
            </HStack>
          )}
        </FormControl>
      </Stack>
    </FormModal>
  )
}
