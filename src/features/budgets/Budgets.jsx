import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Stack, HStack, Text, Button, FormControl, FormLabel, Select, useToast, Center, Spinner,
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter,
} from '@chakra-ui/react'
import { Target, CalendarDays, Copy, Pencil, Trash2 } from 'lucide-react'
import PageHeader from '../../shared/ui/PageHeader.jsx'
import Panel from '../../shared/ui/kit/Panel.jsx'
import { useCategories } from '../transactions/useData.js'
import { useProfile } from '../../shared/lib/ProfileProvider.jsx'
import { toMinor } from '../../shared/lib/currency.js'
import { monthTitle } from '../../shared/lib/dates.js'
import { useAsyncSubmit } from '../../shared/lib/useAsyncSubmit.js'
import MoneyInput from '../../shared/ui/MoneyInput.jsx'
import { editBudget, deleteBudget, copyPreviousBudgets, useMonthBudgets } from './budgets.js'
import { useBudgetProgress } from './useBudgetProgress.js'
import { carriedLabel, previousPeriod } from './budgetMath.js'
import BudgetRow from './BudgetRow.jsx'
import { categoryPath } from '../categories/categoryLinks.js'
import QueryError from '../../shared/ui/QueryError.jsx'

export default function Budgets() {
  const { baseCurrency } = useProfile()
  const { categories } = useCategories('expense')
  // Progress (budgets + their spend) is the single source, shared with the
  // dashboard card; the page owns the "set a cap" form, edit/delete and copy.
  const { items, carriedFrom, periodStart, loading, error, reload } = useBudgetProgress()
  const prev = useMonthBudgets(previousPeriod(periodStart))
  const [catId, setCatId] = useState('')
  const [amount, setAmount] = useState('')
  const [confirmCopy, setConfirmCopy] = useState(false)
  const navigate = useNavigate()
  const toast = useToast()
  const { busy: copying, run } = useAsyncSubmit()

  async function addBudget(e) {
    e.preventDefault()
    if (!catId || !amount) return
    try {
      await editBudget({
        categoryId: catId,
        amountMinor: toMinor(amount, baseCurrency),
        currency: baseCurrency,
        periodStart,
      })
      setAmount(''); setCatId('')
      toast({ title: 'Budget saved', status: 'success' })
      reload() // live via realtime too; this covers a dropped socket
    } catch (err) {
      toast({ title: err.message, status: 'error' })
    }
  }

  // Editing happens on the category's page, in its Edit panel.
  function startEdit(item) {
    navigate(categoryPath(item.categoryId), { state: { edit: true } })
  }

  async function remove(item) {
    try {
      await deleteBudget({ categoryId: item.categoryId, periodStart })
      toast({ title: `${item.name} budget removed`, status: 'success' })
      reload()
    } catch (err) { toast({ title: err.message, status: 'error' }) }
  }

  async function copy() {
    await run(async () => {
      const n = await copyPreviousBudgets(periodStart)
      toast({ title: `Copied ${n} ${n === 1 ? 'budget' : 'budgets'} from last month`, status: 'success' })
      setConfirmCopy(false)
      reload()
    })
  }

  // Copying makes sense once this month has its own caps (or none): a month
  // still showing last month's is already using them.
  const canCopy = !carriedFrom && prev.rows.length > 0
  const copyButton = canCopy && (
    <Button size="xs" variant="ghost" leftIcon={<Copy size={14} />} isLoading={copying}
      onClick={() => (items.length ? setConfirmCopy(true) : copy())}>
      Copy last month’s budgets
    </Button>
  )

  return (
    <Stack spacing={5}>
      <PageHeader eyebrow={monthTitle()} title="Budgets" />

      <Panel icon={Target} title="Set a monthly cap">
        <form onSubmit={addBudget}>
          <HStack align="end" spacing={3}>
            <FormControl>
              <FormLabel>Category</FormLabel>
              <Select placeholder="Select" value={catId} onChange={(e) => setCatId(e.target.value)}>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </FormControl>
            <FormControl maxW="160px">
              <FormLabel>Monthly cap</FormLabel>
              <MoneyInput value={amount} onChange={setAmount} />
            </FormControl>
            <Button type="submit">Set</Button>
          </HStack>
        </form>
      </Panel>

      <Panel icon={CalendarDays} title="This month"
        subtitle={carriedFrom ? carriedLabel(carriedFrom, periodStart) : undefined}
        action={items.length > 0 ? copyButton : undefined}>
        {error ? <QueryError error={error} onRetry={reload} what="budgets" /> : loading ? (
          <Center py={8}><Spinner color="brand.500" /></Center>
        ) : items.length === 0 ? (
          <Stack spacing={3} align="start">
            <Text color="text.muted" fontSize="sm">No budgets set for this month yet.</Text>
            {copyButton}
          </Stack>
        ) : (
          <Stack spacing={5}>
            <Text color="text.muted" fontSize="sm">
              Tap a budget to see what you spent and change it.
            </Text>
            {carriedFrom && (
              <Text color="text.muted" fontSize="sm">
                Budgets roll over until you change them. Edit or delete one and this month gets its own.
              </Text>
            )}
            <Stack spacing={5} role="list" aria-label="Budgets">
              {items.map((b) => (
                <BudgetRow key={b.id} item={b} currency={baseCurrency} actions={[
                  { label: `Edit ${b.name} budget`, icon: Pencil, onClick: () => startEdit(b) },
                  { label: `Delete ${b.name} budget`, icon: Trash2, danger: true, onClick: () => remove(b) },
                ]} />
              ))}
            </Stack>
          </Stack>
        )}
      </Panel>

      <Modal isOpen={confirmCopy} onClose={() => setConfirmCopy(false)} isCentered>
        <ModalOverlay />
        <ModalContent mx={4}>
          <ModalHeader>Copy last month’s budgets?</ModalHeader>
          <ModalBody>
            <Text color="text.muted">
              This month’s {items.length} {items.length === 1 ? 'cap is' : 'caps are'} replaced
              by last month’s {prev.rows.length}.
            </Text>
          </ModalBody>
          <ModalFooter gap={2}>
            <Button variant="ghost" onClick={() => setConfirmCopy(false)}>Cancel</Button>
            <Button isLoading={copying} onClick={copy}>Copy</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Stack>
  )
}
