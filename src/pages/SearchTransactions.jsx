import { useMemo, useState } from 'react'
import {
  Heading, Stack, Card, CardBody, HStack, Input, Select,
  InputGroup, InputLeftElement, Button, Text, Center, Spinner, Spacer,
  FormControl, FormLabel, SimpleGrid,
} from '@chakra-ui/react'
import { Search, X } from 'lucide-react'
import TransactionList from '../components/TransactionList.jsx'
import OptionalDate from '../components/OptionalDate.jsx'
import { useTransactions, useCategories } from '../lib/useData.js'
import { useProfile } from '../lib/useProfile.js'
import { toBaseMinor, toMinor, formatMoney } from '../lib/currency.js'

const EMPTY = { text: '', kind: 'all', categoryId: '', from: '', to: '', min: '', max: '' }

export default function SearchTransactions() {
  const { baseCurrency = 'EUR' } = useProfile()
  const [f, setF] = useState(EMPTY)
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }))

  // Server-side coarse filter (indexed columns); text + amount are refined
  // client-side below so they can span description, notes and category name.
  const { rows, loading, reload, mutate } = useTransactions({
    kind: f.kind === 'all' ? undefined : f.kind,
    from: f.from || undefined,
    to: f.to || undefined,
    categoryId: f.categoryId || undefined,
    limit: 1000,
    withGroup: true,
  })

  const { categories } = useCategories(f.kind === 'all' ? undefined : f.kind)

  const minBase = f.min !== '' ? toMinor(f.min, baseCurrency) : null
  const maxBase = f.max !== '' ? toMinor(f.max, baseCurrency) : null
  const q = f.text.trim().toLowerCase()

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (q) {
        const hay = `${r.description ?? ''} ${r.notes ?? ''} ${r.categories?.name ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (minBase != null || maxBase != null) {
        const base = toBaseMinor(r.amount_minor, r.exchange_rate, r.currency, baseCurrency)
        if (minBase != null && base < minBase) return false
        if (maxBase != null && base > maxBase) return false
      }
      return true
    })
  }, [rows, q, minBase, maxBase, baseCurrency])

  const net = filtered.reduce((s, r) => {
    const b = toBaseMinor(r.amount_minor, r.exchange_rate, r.currency, baseCurrency)
    return s + (r.kind === 'income' ? b : -b)
  }, 0)

  const active = JSON.stringify(f) !== JSON.stringify(EMPTY)

  return (
    <Stack spacing={5}>
      <Heading size="lg">Search</Heading>

      <Card><CardBody>
        <Stack spacing={4}>
          <InputGroup>
            <InputLeftElement pointerEvents="none"><Search size={16} /></InputLeftElement>
            <Input placeholder="Search description, notes or category…"
              value={f.text} onChange={(e) => set('text')(e.target.value)} />
          </InputGroup>

          <SimpleGrid columns={{ base: 2, md: 4 }} spacing={3}>
            <FormControl>
              <FormLabel fontSize="xs" color="text.muted">Type</FormLabel>
              <Select value={f.kind} onChange={(e) => setF((s) => ({ ...s, kind: e.target.value, categoryId: '' }))}>
                <option value="all">All</option>
                <option value="expense">Expenses</option>
                <option value="income">Income</option>
              </Select>
            </FormControl>
            <FormControl>
              <FormLabel fontSize="xs" color="text.muted">Category</FormLabel>
              <Select placeholder="Any" value={f.categoryId}
                onChange={(e) => set('categoryId')(e.target.value)}>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </FormControl>
            <FormControl>
              <OptionalDate label="From" value={f.from} onChange={set('from')} />
            </FormControl>
            <FormControl>
              <OptionalDate label="To" value={f.to} onChange={set('to')} />
            </FormControl>
            <FormControl>
              <FormLabel fontSize="xs" color="text.muted">Min ({baseCurrency})</FormLabel>
              <Input type="number" inputMode="decimal" placeholder="0"
                value={f.min} onChange={(e) => set('min')(e.target.value)} />
            </FormControl>
            <FormControl>
              <FormLabel fontSize="xs" color="text.muted">Max ({baseCurrency})</FormLabel>
              <Input type="number" inputMode="decimal" placeholder="∞"
                value={f.max} onChange={(e) => set('max')(e.target.value)} />
            </FormControl>
          </SimpleGrid>

          {active && (
            <HStack>
              <Button size="sm" variant="ghost" leftIcon={<X size={14} />}
                onClick={() => setF(EMPTY)}>Clear filters</Button>
              <Spacer />
            </HStack>
          )}
        </Stack>
      </CardBody></Card>

      <Card><CardBody>
        <HStack mb={3} align="baseline">
          <Heading size="sm">
            {loading ? 'Searching…' : `${filtered.length} result${filtered.length === 1 ? '' : 's'}`}
          </Heading>
          <Spacer />
          {!loading && filtered.length > 0 && (
            <Text fontSize="sm" color="text.muted">
              Net {net < 0 ? '−' : ''}{formatMoney(Math.abs(net), baseCurrency)}
            </Text>
          )}
        </HStack>
        {loading ? (
          <Center py={8}><Spinner color="brand.500" /></Center>
        ) : filtered.length === 0 ? (
          <Text color="text.muted">
            {active ? 'No transactions match these filters.' : 'Start typing or pick a filter to search your transactions.'}
          </Text>
        ) : (
          <TransactionList rows={filtered} kind="expense" baseCurrency={baseCurrency}
            mutate={mutate} reload={reload} />
        )}
      </CardBody></Card>
    </Stack>
  )
}
