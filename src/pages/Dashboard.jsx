import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  SimpleGrid, Card, CardBody, Stat, StatLabel, StatNumber, StatHelpText,
  Heading, Box, Text, Stack, Center, Spinner, Spacer, HStack, IconButton,
  Table, Thead, Tbody, Tr, Th, Td, Tooltip as CkTooltip,
} from '@chakra-ui/react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import { PieChart as PieIcon, Table as TableIcon, Repeat, ChevronRight, TrendingUp as TrendingUpIcon } from 'lucide-react'
import { useTransactions, monthRange } from '../lib/useData.js'
import { useProfile } from '../lib/useProfile.js'
import { useRecurring, monthlyMinor } from '../lib/recurring.js'
import { formatMoney, toBaseMinor } from '../lib/currency.js'
import { STORAGE_KEYS } from '../lib/keys.js'

const VIEW_KEY = STORAGE_KEYS.overviewView

// Warm-led categorical palette (coral/amber first, then complementary hues).
const COLORS = ['#f95d38', '#fbb324', '#ef8a5a', '#e2431f', '#f6c453', '#c2703d', '#7c6f59', '#d6ccba']

export default function Dashboard() {
  const navigate = useNavigate()
  const { baseCurrency } = useProfile()
  const { from, to } = useMemo(() => monthRange(), [])
  const { rows, loading } = useTransactions({ from, to })
  const { rules } = useRecurring()
  const [view, setView] = useState(() => localStorage.getItem(VIEW_KEY) || 'pie')
  function chooseView(v) { setView(v); localStorage.setItem(VIEW_KEY, v) }

  const subsMonthly = useMemo(() => rules.reduce(
    (s, r) => s + (r.is_active && r.kind !== 'income' ? monthlyMinor(r) : 0), 0), [rules])

  const { spent, earned, byCategory } = useMemo(() => {
    let spent = 0, earned = 0
    const cat = new Map()
    for (const r of rows) {
      const base = toBaseMinor(r.amount_minor, r.exchange_rate, r.currency, baseCurrency)
      if (r.kind === 'income') {
        earned += base
      } else {
        spent += base
        const name = r.categories?.name ?? 'Uncategorized'
        cat.set(name, (cat.get(name) ?? 0) + base)
      }
    }
    const byCategory = [...cat.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
    return { spent, earned, byCategory }
  }, [rows, baseCurrency])

  if (loading) return <Center py={20}><Spinner color="brand.500" /></Center>

  return (
    <Stack spacing={5}>
      <Heading size="lg">This month</Heading>

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
        {byCategory.length === 0 ? (
          <Text color="text.muted">No expenses yet this month.</Text>
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

      <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={4}>
        <Card as="button" textAlign="left" onClick={() => navigate('/insights')}
          _hover={{ borderColor: 'brand.300' }} transition="border-color 0.15s">
          <CardBody>
            <HStack spacing={3}>
              <Box color="accent.fg"><TrendingUpIcon size={20} /></Box>
              <Box flex="1">
                <Text fontWeight="600">Insights</Text>
                <Text fontSize="sm" color="text.muted">Trends, net worth & goals</Text>
              </Box>
              <Box color="text.muted"><ChevronRight size={18} /></Box>
            </HStack>
          </CardBody>
        </Card>
        <Card as="button" textAlign="left" onClick={() => navigate('/recurring')}
          _hover={{ borderColor: 'brand.300' }} transition="border-color 0.15s">
          <CardBody>
            <HStack spacing={3}>
              <Box color="accent.fg"><Repeat size={20} /></Box>
              <Box flex="1">
                <Text fontWeight="600">Recurring</Text>
                <Text fontSize="sm" color="text.muted">
                  {subsMonthly > 0
                    ? `${formatMoney(subsMonthly, baseCurrency)} / month`
                    : 'Subscriptions & bills'}
                </Text>
              </Box>
              <Box color="text.muted"><ChevronRight size={18} /></Box>
            </HStack>
          </CardBody>
        </Card>
      </SimpleGrid>
    </Stack>
  )
}
