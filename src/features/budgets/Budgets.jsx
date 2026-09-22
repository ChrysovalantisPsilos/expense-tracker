import { useState } from 'react'
import {
  Stack, Card, CardBody, HStack, Text, Spacer, Progress, Button,
  FormControl, FormLabel, Select, useToast, Center, Spinner, Box,
} from '@chakra-ui/react'
import CategoryBadge from '../../shared/ui/CategoryBadge.jsx'
import PageHeader from '../../shared/ui/PageHeader.jsx'
import { useCategories, monthRange } from '../transactions/useData.js'
import { useProfile } from '../../shared/lib/useProfile.js'
import { formatMoney, toMinor } from '../../shared/lib/currency.js'
import { monthTitle } from '../../shared/lib/dates.js'
import MoneyInput from '../../shared/ui/MoneyInput.jsx'
import { saveBudget } from './budgets.js'
import { useBudgetProgress } from './useBudgetProgress.js'

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

      <Card><CardBody>
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
      </CardBody></Card>

      {loading ? (
        <Center py={8}><Spinner color="brand.500" /></Center>
      ) : items.length === 0 ? (
        <Text color="text.muted">No budgets set for this month yet.</Text>
      ) : (
        <Stack spacing={3}>
          {items.map((b) => {
            const pct = b.limit > 0 ? Math.min(100, Math.round((b.spent / b.limit) * 100)) : 0
            const over = b.tone === 'negative'
            return (
              <Card key={b.id}><CardBody>
                <HStack mb={3} spacing={3}>
                  <CategoryBadge category={b.category} size={32} />
                  <Text fontWeight="600">{b.name}</Text>
                  <Spacer />
                  <Text fontSize="sm" color={over ? 'status.negative' : 'text.muted'}>
                    {formatMoney(b.spent, baseCurrency)} / {formatMoney(b.limit, baseCurrency)}
                  </Text>
                </HStack>
                <Progress value={pct} variant={b.tone} />
                {over && <Box mt={1}><Text fontSize="xs" color="status.negative">Over budget</Text></Box>}
              </CardBody></Card>
            )
          })}
        </Stack>
      )}
    </Stack>
  )
}
