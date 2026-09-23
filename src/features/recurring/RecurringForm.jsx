import { useState } from 'react'
import { Stack, HStack, Button, FormControl, FormLabel, Input, Select, useToast } from '@chakra-ui/react'
import MoneyInput from '../../shared/ui/MoneyInput.jsx'
import FormModal from '../../shared/ui/FormModal.jsx'
import { useCategories } from '../transactions/useData.js'
import { toMinor, fromMinor } from '../../shared/lib/currency.js'
import { today } from '../../shared/lib/dates.js'
import { useAsyncSubmit } from '../../shared/lib/useAsyncSubmit.js'
import { saveRecurring } from './recurring.js'
import { editRepeat, repeatDraft, repeatRuleFields } from './recurringMath.js'
import RepeatFields from './RepeatFields.jsx'

// Add or edit a recurring rule. `rule` edits an existing one; otherwise a new
// one starts as `kind` (the Recurring page's open tab). Pausing lives on the
// page's rows, so the schedule here has no Paused switch.
export default function RecurringForm({ rule, kind: initialKind = 'expense', baseCurrency, onClose, onSaved }) {
  const toast = useToast()
  const isEdit = !!rule
  const [kind, setKind] = useState(rule?.kind ?? initialKind)
  const { categories } = useCategories(kind)
  const [amount, setAmount] = useState(rule ? String(fromMinor(rule.amount_minor, rule.currency)) : '')
  const [currency] = useState(rule?.currency ?? baseCurrency)
  const [categoryId, setCategoryId] = useState(rule?.category_id ?? '')
  const [description, setDescription] = useState(rule?.description ?? '')
  const [draft, setDraft] = useState(() => repeatDraft(rule, { todayISO: today() }))
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
        ...repeatRuleFields(draft),
      })
      toast({ title: isEdit ? 'Recurring entry updated' : 'Recurring entry added', status: 'success' })
      onSaved()
    })
  }

  const pickKind = (k) => { setKind(k); setCategoryId('') }

  return (
    <FormModal isOpen onClose={onClose} scrollBehavior="inside" onSubmit={submit} busy={busy}
      title={isEdit ? 'Edit recurring entry' : 'New recurring entry'}
      submitLabel={isEdit ? 'Save' : 'Add'}>
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
          <MoneyInput value={amount} onChange={setAmount} />
        </FormControl>

        <FormControl>
          <FormLabel>Category</FormLabel>
          <Select placeholder="Uncategorized" value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </FormControl>

        <RepeatFields value={draft} onChange={(c) => setDraft((d) => editRepeat(d, c))}
          kind={kind} currency={currency} amountMinor={Number(amount) > 0 ? toMinor(amount, currency) : 0}
          idPrefix="rule" />
      </Stack>
    </FormModal>
  )
}
