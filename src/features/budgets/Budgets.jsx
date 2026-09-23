import { useState } from 'react'
import {
  Stack, HStack, Text, Button, FormControl, FormLabel, Select, useToast, Center, Spinner,
} from '@chakra-ui/react'
import { Target, CalendarDays } from 'lucide-react'
import PageHeader from '../../shared/ui/PageHeader.jsx'
import Panel from '../../shared/ui/kit/Panel.jsx'
import { useCategories, monthRange } from '../transactions/useData.js'
import { useProfile } from '../../shared/lib/useProfile.js'
import { toMinor } from '../../shared/lib/currency.js'
import { monthTitle } from '../../shared/lib/dates.js'
import MoneyInput from '../../shared/ui/MoneyInput.jsx'
import { saveBudget } from './budgets.js'
import { useBudgetProgress } from './useBudgetProgress.js'
import BudgetRow from './BudgetRow.jsx'

export default function Budgets() {
  const { baseCurrency } = useProfile()
  const { categories } = useCategories('expense')
  const { from: periodStart } = monthRange()
  // Progress (budgets + their spend) is the single source, shared with the
  // dashboard card; the page only owns the "set a cap" form.
  const { items, loading } = useBudgetProgress()
  const [catId, setCatId] = useState('')
  const [amount, setAmount] = useState('')
  const toast = useToast()

  async function addBudget(e) {
    e.preventDefault()
    if (!catId || !amount) return
    try {
      await saveBudget({
        categoryId: catId,
        amountMinor: toMinor(amount, baseCurrency),
        currency: baseCurrency,
        periodStart,
      })
      setAmount(''); setCatId('')
      toast({ title: 'Budget saved', status: 'success' })
      // The list refreshes itself — budgets are live via realtime.
    } catch (err) {
      toast({ title: err.message, status: 'error' })
    }
  }

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

      <Panel icon={CalendarDays} title="This month">
        {loading ? (
          <Center py={8}><Spinner color="brand.500" /></Center>
        ) : items.length === 0 ? (
          <Text color="text.muted" fontSize="sm">No budgets set for this month yet.</Text>
        ) : (
          <Stack spacing={5} role="list" aria-label="Budgets">
            {items.map((b) => <BudgetRow key={b.id} item={b} currency={baseCurrency} />)}
          </Stack>
        )}
      </Panel>
    </Stack>
  )
}
