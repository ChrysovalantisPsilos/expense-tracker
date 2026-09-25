import { useState } from 'react'
import { Stack, HStack, Button, FormControl, FormLabel, Input, Select, useToast } from '@chakra-ui/react'
import MoneyInput from '../../shared/ui/MoneyInput.jsx'
import { PageForm } from '../../shared/ui/FormPage.jsx'
import { useCategories } from '../transactions/useData.js'
import { useSavingsIds } from '../categories/categories.js'
import { PaidFromSavingsSwitch, SavingsSourceSwitch } from '../../shared/ui/SavingsSwitches.jsx'
import { toMinor, minorToInput } from '../../shared/lib/currency.js'
import { today } from '../../shared/lib/dates.js'
import { useAsyncSubmit } from '../../shared/lib/useAsyncSubmit.js'
import { saveRecurring } from './recurring.js'
import { editRepeat, repeatDraft, repeatRuleFields } from './recurringMath.js'
import RepeatFields from './RepeatFields.jsx'

// The body of a recurring rule's page (RecurringPage). `rule` edits an
// existing one; otherwise a new one starts as `kind`. Pausing lives on the
// Recurring page's rows, so the schedule here has no Paused switch.
// Recurring income in a savings category (0084) asks "Taken from my income"
// (on for a new rule, as stored when editing); each entry the rule adds
// carries it. A recurring expense asks "Paid from savings" (0085; off for a
// new rule, as stored when editing) once the user has a savings category, and
// hands it to its entries the same way. `onSaved` runs after a successful save.
export default function RecurringForm({ rule, kind: initialKind = 'expense', baseCurrency, onSaved }) {
  const toast = useToast()
  const isEdit = !!rule
  const [kind, setKind] = useState(rule?.kind ?? initialKind)
  const { categories } = useCategories(kind)
  const [amount, setAmount] = useState(rule ? minorToInput(rule.amount_minor, rule.currency) : '')
  const [currency] = useState(rule?.currency ?? baseCurrency)
  const [categoryId, setCategoryId] = useState(rule?.category_id ?? '')
  const [description, setDescription] = useState(rule?.description ?? '')
  const [draft, setDraft] = useState(() => repeatDraft(rule, { todayISO: today() }))
  const { savingsIds, loading: savingsLoading } = useSavingsIds()
  const isSavings = kind === 'income' && savingsIds.has(categoryId)
  const [fromIncome, setFromIncome] = useState(rule ? !!rule.savings_from_income : true)
  const [fromSavings, setFromSavings] = useState(!!rule?.paid_from_savings)
  const showFromSavings = kind === 'expense' && (savingsIds.size > 0 || !!rule?.paid_from_savings)
  const { busy, run } = useAsyncSubmit()

  async function submit() {
    if (!amount || Number(amount) <= 0) return toast({ title: 'Enter an amount', status: 'warning' })
    await run(async () => {
      await saveRecurring({
        id: rule?.id,
        kind,
        category_id: categoryId || null,
        amount_minor: toMinor(amount, currency),
        currency,
        description: description || null,
        savings_from_income: isSavings && fromIncome,
        paid_from_savings: showFromSavings && fromSavings,
        ...repeatRuleFields(draft),
      })
      toast({ title: isEdit ? 'Recurring entry updated' : 'Recurring entry added', status: 'success' })
      onSaved()
    })
  }

  const pickKind = (k) => { setKind(k); setCategoryId('') }

  return (
    <PageForm onSubmit={submit} busy={busy} submitLabel={isEdit ? 'Save changes' : 'Add recurring entry'}
      submitProps={{ isDisabled: savingsLoading }}>
      <Stack spacing={4}>
        <HStack spacing={2}>
          <Button flex="1" variant={kind === 'expense' ? 'solid' : 'outline'}
            colorScheme={kind === 'expense' ? 'brand' : 'gray'} aria-pressed={kind === 'expense'}
            onClick={() => pickKind('expense')}>Expense</Button>
          <Button flex="1" variant={kind === 'income' ? 'solid' : 'outline'}
            colorScheme={kind === 'income' ? 'brand' : 'gray'} aria-pressed={kind === 'income'}
            onClick={() => pickKind('income')}>Income</Button>
        </HStack>

        <FormControl isRequired>
          <FormLabel>Description</FormLabel>
          <Input value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder={kind === 'income' ? 'Salary' : 'Netflix, rent, gym…'} />
        </FormControl>

        <FormControl isRequired>
          <FormLabel>Amount ({currency})</FormLabel>
          <MoneyInput currency={currency} value={amount} onChange={setAmount} />
        </FormControl>

        <FormControl>
          <FormLabel>Category</FormLabel>
          <Select placeholder="Uncategorized" value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </FormControl>
        {isSavings && <SavingsSourceSwitch value={fromIncome} onChange={setFromIncome} />}
        {showFromSavings && <PaidFromSavingsSwitch value={fromSavings} onChange={setFromSavings} />}

        <RepeatFields value={draft} onChange={(c) => setDraft((d) => editRepeat(d, c))}
          kind={kind} currency={currency} amountMinor={Number(amount) > 0 ? toMinor(amount, currency) : 0}
          idPrefix="rule" />
      </Stack>
    </PageForm>
  )
}
