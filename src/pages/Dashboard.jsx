import { useEffect, useMemo, useState } from 'react'
import {
  SimpleGrid, Card, CardBody, Stat, StatLabel, StatNumber, StatHelpText,
  Heading, Box, Text, Stack, Center, Spinner, Spacer, HStack, IconButton,
  Table, Thead, Tbody, Tr, Th, Td, Tooltip as CkTooltip, Select,
} from '@chakra-ui/react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import { PieChart as PieIcon, Table as TableIcon } from 'lucide-react'
import TransactionList from '../components/TransactionList.jsx'
import { useTransactions, buildPeriods, oldestTransactionDate } from '../lib/useData.js'
import { useProfile } from '../lib/useProfile.js'
import { formatMoney, toBaseMinor } from '../lib/currency.js'
import { STORAGE_KEYS } from '../lib/keys.js'

const VIEW_KEY = STORAGE_KEYS.overviewView

// Warm-led categorical palette (coral/amber first, then complementary hues).
const COLORS = ['#f95d38', '#fbb324', '#ef8a5a', '#e2431f', '#f6c453', '#c2703d', '#7c6f59', '#d6ccba']

// Bucket label for the category breakdown: mirrored group expenses roll up
// under their group's name; everything else uses its category (or Uncategorized).
const bucketOf = (r) =>
  r.group_expense_id ? (r.group_expenses?.groups?.name ?? 'Group')
    : (r.categories?.name ?? 'Uncategorized')

export default function Dashboard() {
  const { baseCurrency } = useProfile()
  const [oldest, setOldest] = useState(null)
  useEffect(() => { oldestTransactionDate().then(setOldest) }, [])
  const periods = useMemo(() => buildPeriods(oldest), [oldest])
  // Default to this month; its token is stable and always present in the list.
  const [periodValue, setPeriodValue] = useState(() => buildPeriods(null)[0].value)
  const period = periods.find((p) => p.value === periodValue) ?? periods[0]

  const { rows, loading, reload, mutate } = useTransactions({
    from: period.from ?? undefined, to: period.to ?? undefined, withGroup: true,
  })
  const [view, setView] = useState(() => localStorage.getItem(VIEW_KEY) || 'pie')
  function chooseView(v) { setView(v); localStorage.setItem(VIEW_KEY, v) }

  const { spent, earned, byCategory, expenses } = useMemo(() => {
    let spent = 0, earned = 0
    const cat = new Map()
    const expenses = []
    for (const r of rows) {
      const base = toBaseMinor(r.amount_minor, r.exchange_rate, r.currency, baseCurrency)
      if (r.kind === 'income') {
        earned += base
      } else {
        spent += base
        expenses.push(r)
        const name = bucketOf(r)
        cat.set(name, (cat.get(name) ?? 0) + base)
      }
    }
    const byCategory = [...cat.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
    return { spent, earned, byCategory, expenses }
  }, [rows, baseCurrency])

  return (
    <Stack spacing={5}>
      <HStack align="center">
        <Heading size="lg">Overview</Heading>
        <Spacer />
        <Select maxW="200px" size="sm" borderRadius="lg" value={periodValue}
          onChange={(e) => setPeriodValue(e.target.value)}>
          {periods.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </Select>
      </HStack>

      <SimpleGrid columns={{ base: 1, sm: 3 }} spacing={4}>
        <Card><CardBody>
          <Stat>
            <StatLabel>Spent</StatLabel>
            <StatNumber>{formatMoney(spent, baseCurrency)}</StatNumber>
          </Stat>
        </CardBody></Card>
        <Card><CardBody>
          <Stat>
            <StatLabel>Income</StatLabel>
            <StatNumber>{formatMoney(earned, baseCurrency)}</StatNumber>
          </Stat>
        </CardBody></Card>
        <Card><CardBody>
          <Stat>
            <StatLabel>Net</StatLabel>
            <StatNumber color={earned - spent >= 0 ? 'green.500' : 'red.500'}>
              {formatMoney(earned - spent, baseCurrency)}
            </StatNumber>
            <StatHelpText>income − expenses</StatHelpText>
          </Stat>
        </CardBody></Card>
      </SimpleGrid>

      <Card><CardBody>
        <HStack mb={4}>
          <Heading size="sm">Spending by category</Heading>
          <Spacer />
          <HStack spacing={1} bg="bg.subtle" p={1} borderRadius="lg">
            <CkTooltip label="Chart">
              <IconButton aria-label="Chart view" size="xs" icon={<PieIcon size={15} />}
                variant={view === 'pie' ? 'solid' : 'ghost'}
                colorScheme={view === 'pie' ? 'brand' : 'gray'}
                onClick={() => chooseView('pie')} />
            </CkTooltip>
            <CkTooltip label="Table">
              <IconButton aria-label="Table view" size="xs" icon={<TableIcon size={15} />}
                variant={view === 'table' ? 'solid' : 'ghost'}
                colorScheme={view === 'table' ? 'brand' : 'gray'}
                onClick={() => chooseView('table')} />
            </CkTooltip>
          </HStack>
        </HStack>
        {loading ? (
          <Center py={8}><Spinner color="brand.500" /></Center>
        ) : byCategory.length === 0 ? (
          <Text color="text.muted">No expenses in this period.</Text>
        ) : view === 'pie' ? (
          <Box h="280px">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={byCategory} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={2}>
                  {byCategory.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => formatMoney(v, baseCurrency)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </Box>
        ) : (
          <Table size="sm" variant="simple">
            <Thead>
              <Tr>
                <Th>Category</Th>
                <Th isNumeric>Amount</Th>
                <Th isNumeric>Share</Th>
              </Tr>
            </Thead>
            <Tbody>
              {byCategory.map((c, i) => (
                <Tr key={c.name}>
                  <Td>
                    <HStack spacing={2}>
                      <Box boxSize="10px" borderRadius="sm" bg={COLORS[i % COLORS.length]} />
                      <Text>{c.name}</Text>
                    </HStack>
                  </Td>
                  <Td isNumeric fontWeight="600">{formatMoney(c.value, baseCurrency)}</Td>
                  <Td isNumeric color="text.muted">{spent ? Math.round((c.value / spent) * 100) : 0}%</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </CardBody></Card>

      <Card><CardBody>
        <Heading size="sm" mb={3}>Expenses</Heading>
        {loading ? (
          <Center py={8}><Spinner color="brand.500" /></Center>
        ) : expenses.length === 0 ? (
          <Text color="text.muted">No expenses in this period.</Text>
        ) : (
          <TransactionList rows={expenses} kind="expense" baseCurrency={baseCurrency}
            mutate={mutate} reload={reload} />
        )}
      </CardBody></Card>
    </Stack>
  )
}
