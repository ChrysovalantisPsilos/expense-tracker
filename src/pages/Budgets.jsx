import { useEffect, useMemo, useState } from 'react'
import {
  Heading, Stack, Card, CardBody, HStack, Text, Spacer, Progress, Button,
  FormControl, FormLabel, Select, Input, useToast, Center, Spinner, Box,
} from '@chakra-ui/react'
import { supabase } from '../lib/supabase.js'
import CategoryBadge from '../components/CategoryBadge.jsx'
import { useAuth } from '../auth/AuthProvider.jsx'
import { useCategories, useTransactions, monthRange } from '../lib/useData.js'
import { useProfile } from '../lib/useProfile.js'
import { formatMoney, toMinor, toBaseMinor } from '../lib/currency.js'

function periodStart(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}

export default function Budgets() {
  const { user } = useAuth()
  const { baseCurrency } = useProfile()
  const { categories } = useCategories('expense')
  const { from, to } = monthRange()
  const { rows } = useTransactions({ kind: 'expense', from, to })
  const [budgets, setBudgets] = useState([])
  const [loading, setLoading] = useState(true)
  const [catId, setCatId] = useState('')
  const [amount, setAmount] = useState('')
  const toast = useToast()

  const start = periodStart()

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('budgets').select('*, categories(name, icon)').eq('period_start', start)
    setBudgets(data ?? [])
    setLoading(false)
  }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [])

  // Actual spend per category (in base currency) for the current month.
  const spentByCat = useMemo(() => {
    const m = new Map()
    for (const r of rows) {
      if (!r.category_id) continue
      m.set(r.category_id, (m.get(r.category_id) ?? 0) + toBaseMinor(r.amount_minor, r.exchange_rate))
    }
    return m
  }, [rows])

  async function addBudget(e) {
    e.preventDefault()
    if (!catId || !amount) return
    const { error } = await supabase.from('budgets').upsert({
      user_id: user.id,
      category_id: catId,
      amount_minor: toMinor(amount, baseCurrency),
      currency: baseCurrency,
      period_start: start,
    }, { onConflict: 'user_id,category_id,period_start' })
    if (error) { toast({ title: error.message, status: 'error' }); return }
    setAmount(''); setCatId('')
    toast({ title: 'Budget saved', status: 'success' })
    load()
  }

  return (
    <Stack spacing={5}>
      <Heading size="lg">Budgets</Heading>

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
              <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </FormControl>
            <Button type="submit">Set</Button>
          </HStack>
        </form>
      </CardBody></Card>

      {loading ? (
        <Center py={8}><Spinner color="brand.500" /></Center>
      ) : budgets.length === 0 ? (
        <Text color="text.muted">No budgets set for this month yet.</Text>
      ) : (
        <Stack spacing={3}>
          {budgets.map((b) => {
            const actual = spentByCat.get(b.category_id) ?? 0
            const pct = b.amount_minor > 0 ? Math.min(100, Math.round((actual / b.amount_minor) * 100)) : 0
            const over = actual > b.amount_minor
            return (
              <Card key={b.id}><CardBody>
                <HStack mb={3} spacing={3}>
                  <CategoryBadge category={b.categories} size={32} />
                  <Text fontWeight="600">{b.categories?.name}</Text>
                  <Spacer />
                  <Text fontSize="sm" color={over ? 'red.500' : 'text.muted'}>
                    {formatMoney(actual, baseCurrency)} / {formatMoney(b.amount_minor, baseCurrency)}
                  </Text>
                </HStack>
                <Progress value={pct} colorScheme={over ? 'red' : pct > 80 ? 'orange' : 'brand'} borderRadius="full" />
                {over && <Box mt={1}><Text fontSize="xs" color="red.500">Over budget</Text></Box>}
              </CardBody></Card>
            )
          })}
        </Stack>
      )}
    </Stack>
  )
}
