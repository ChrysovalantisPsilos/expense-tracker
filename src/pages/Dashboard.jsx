import { useMemo } from 'react'
import {
  SimpleGrid, Card, CardBody, Stat, StatLabel, StatNumber, StatHelpText,
  Heading, Box, Text, Stack, Center, Spinner,
} from '@chakra-ui/react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import { useTransactions, monthRange } from '../lib/useData.js'
import { useProfile } from '../lib/useProfile.js'
import { formatMoney, toBaseMinor } from '../lib/currency.js'

// Warm-led categorical palette (coral/amber first, then complementary hues).
const COLORS = ['#f95d38', '#fbb324', '#ef8a5a', '#e2431f', '#f6c453', '#c2703d', '#7c6f59', '#d6ccba']

export default function Dashboard() {
  const { baseCurrency } = useProfile()
  const { from, to } = useMemo(() => monthRange(), [])
  const { rows, loading } = useTransactions({ from, to })

  const { spent, earned, byCategory } = useMemo(() => {
    let spent = 0, earned = 0
    const cat = new Map()
    for (const r of rows) {
      const base = toBaseMinor(r.amount_minor, r.exchange_rate)
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
  }, [rows])

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
        <Heading size="sm" mb={4}>Spending by category</Heading>
        {byCategory.length === 0 ? (
          <Text color="text.muted">No expenses yet this month.</Text>
        ) : (
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
        )}
      </CardBody></Card>
    </Stack>
  )
}
