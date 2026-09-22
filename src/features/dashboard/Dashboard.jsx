import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  SimpleGrid, Card, CardBody, Stat, StatLabel, StatNumber, StatHelpText,
  Box, Text, Stack, Center, Spinner, HStack, IconButton,
  Table, Thead, Tbody, Tr, Th, Td, Tooltip as CkTooltip, Select, Button,
  List, ListItem, Divider, Wrap, WrapItem,
} from '@chakra-ui/react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { PieChart as PieIcon, Table as TableIcon, Repeat, ReceiptText } from 'lucide-react'
import TransactionList from '../transactions/TransactionList.jsx'
import { useTransactions, buildPeriods, oldestTransactionDate } from '../transactions/useData.js'
import { today, shortDate } from '../../shared/lib/dates.js'
import { useProfile } from '../../shared/lib/useProfile.js'
import { useRecurring, monthlyMinor, frequencyLabel, expectedInWindow } from '../recurring/recurring.js'
import { formatMoney, toBaseMinor } from '../../shared/lib/currency.js'
import { bucketOf, sumToBaseByKey } from '../../shared/lib/txnRollup.js'
import { STORAGE_KEYS } from '../../shared/lib/keys.js'
import { usePaged } from '../../shared/ui/usePaged.js'
import Paginator from '../../shared/ui/Paginator.jsx'
import PageHeader from '../../shared/ui/PageHeader.jsx'
import CardHeader from '../../shared/ui/CardHeader.jsx'
import RowAmount from '../../shared/ui/RowAmount.jsx'
import { useChartTheme } from '../../shared/ui/useChartTheme.jsx'
import BudgetsCard from '../budgets/BudgetsCard.jsx'

const VIEW_KEY = STORAGE_KEYS.overviewView

// A category's colour key, shared by the pie legend and the table view.
const Swatch = ({ color }) => <Box boxSize="10px" borderRadius="sm" bg={color} flexShrink={0} />

export default function Dashboard() {
  const navigate = useNavigate()
  const { baseCurrency } = useProfile()
  const { rules } = useRecurring()
  const chart = useChartTheme()
  const seriesColor = (i) => chart.series[i % chart.series.length]
  const [oldest, setOldest] = useState(null)
  const periods = useMemo(() => buildPeriods(oldest), [oldest])
  // Default to this month; its token is stable and always present in the list.
  const [periodValue, setPeriodValue] = useState(() => buildPeriods(null)[0].value)
  const period = periods.find((p) => p.value === periodValue) ?? periods[0]

  const { rows, loading, reload, mutate } = useTransactions({
    from: period.from ?? undefined, to: period.to ?? undefined,
  })
  // Recheck whenever the (live) transaction rows change, so importing older
  // data extends the period dropdown without a reload. Cheap: 1-row query.
  useEffect(() => { oldestTransactionDate().then(setOldest) }, [rows])
  const [view, setView] = useState(() => localStorage.getItem(VIEW_KEY) || 'pie')
  function chooseView(v) { setView(v); localStorage.setItem(VIEW_KEY, v) }

  // Recurring is forward-looking, so it ignores the historical period filter:
  // it always shows what's coming up next plus the monthly subscriptions total.
  const { subsMonthly, activeRecurring } = useMemo(() => {
    const active = rules.filter((r) => r.is_active)
    const subsMonthly = active.reduce((s, r) => s + (r.kind !== 'income' ? monthlyMinor(r) : 0), 0)
    const activeRecurring = [...active].sort((a, b) => (a.next_run < b.next_run ? -1 : 1))
    return { subsMonthly, activeRecurring }
  }, [rules])

  const { spent, earned, byCategory, expenses } = useMemo(() => {
    let spent = 0, earned = 0
    const expenses = []
    for (const r of rows) {
      const base = toBaseMinor(r.amount_minor, r.exchange_rate, r.currency, baseCurrency)
      if (r.kind === 'income') earned += base
      else { spent += base; expenses.push(r) }
    }
    const byCategory = [...sumToBaseByKey(expenses, baseCurrency, bucketOf).entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
    return { spent, earned, byCategory, expenses }
  }, [rows, baseCurrency])

  // Fold not-yet-charged recurring into the period's spend/income projection,
  // but only for periods that are still ongoing (end today or later). Past
  // periods and "all time" stay purely actual.
  const todayISO = useMemo(() => today(), [])
  const proj = useMemo(() => {
    if (!period.to || period.to < todayISO) return { expense: 0, income: 0 }
    return expectedInWindow(rules, todayISO, period.to)
  }, [rules, period.to, todayISO])
  const spentTotal = spent + proj.expense
  const earnedTotal = earned + proj.income
  const netTotal = earnedTotal - spentTotal

  // Paginate the two lists (10/page). Expenses reset to page 1 when the period
  // changes; recurring clamps if a rule is removed.
  const expPage = usePaged(expenses, 10, periodValue)
  const recPage = usePaged(activeRecurring, 10)

  return (
    <Stack spacing={5}>
      <PageHeader title="Overview" action={
        <Select w={{ base: '140px', sm: '200px' }} size="sm" borderRadius="lg" value={periodValue}
          aria-label="Period" onChange={(e) => setPeriodValue(e.target.value)}>
          {periods.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </Select>
      } />

      <SimpleGrid columns={{ base: 1, sm: 3 }} spacing={4}>
        <Card><CardBody>
          <Stat>
            <StatLabel>Spent</StatLabel>
            <StatNumber>{formatMoney(spentTotal, baseCurrency)}</StatNumber>
            {proj.expense > 0 && (
              <StatHelpText>incl. {formatMoney(proj.expense, baseCurrency)} upcoming</StatHelpText>
            )}
          </Stat>
        </CardBody></Card>
        <Card><CardBody>
          <Stat>
            <StatLabel>Income</StatLabel>
            <StatNumber>{formatMoney(earnedTotal, baseCurrency)}</StatNumber>
            {proj.income > 0 && (
              <StatHelpText>incl. {formatMoney(proj.income, baseCurrency)} upcoming</StatHelpText>
            )}
          </Stat>
        </CardBody></Card>
        <Card><CardBody>
          <Stat>
            <StatLabel>Net</StatLabel>
            <StatNumber color={netTotal >= 0 ? 'status.positive' : 'status.negative'}>
              {formatMoney(netTotal, baseCurrency)}
            </StatNumber>
            <StatHelpText>
              {proj.expense > 0 || proj.income > 0 ? 'incl. upcoming recurring' : 'income − expenses'}
            </StatHelpText>
          </Stat>
        </CardBody></Card>
      </SimpleGrid>

      <Card><CardBody>
        <CardHeader icon={PieIcon} title="Spending by category" action={
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
        } />
        {loading ? (
          <Center py={8}><Spinner color="brand.500" /></Center>
        ) : byCategory.length === 0 ? (
          <Text color="text.muted">No expenses in this period.</Text>
        ) : view === 'pie' ? (
          <>
            <Box h="220px">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={byCategory} dataKey="value" nameKey="name" innerRadius={58} outerRadius={96}
                    paddingAngle={2} stroke={chart.surface}>
                    {byCategory.map((_, i) => <Cell key={i} fill={seriesColor(i)} />)}
                  </Pie>
                  <Tooltip formatter={(v) => formatMoney(v, baseCurrency)} {...chart.tooltip} />
                </PieChart>
              </ResponsiveContainer>
            </Box>
            {/* Our own legend below the chart rather than Recharts' <Legend>, which
                sits inside the fixed-height box and overlaps the donut once it
                wraps on a phone. */}
            <Wrap spacingX={4} spacingY={1.5} justify="center" mt={3}>
              {byCategory.map((c, i) => (
                <WrapItem key={c.name} alignItems="center" gap={1.5}>
                  <Swatch color={seriesColor(i)} />
                  <Text fontSize="xs" color="text.muted">{c.name}</Text>
                </WrapItem>
              ))}
            </Wrap>
          </>
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
                      <Swatch color={seriesColor(i)} />
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

      <BudgetsCard />

      <Card><CardBody>
        <CardHeader icon={ReceiptText} title="Expenses" />
        {loading ? (
          <Center py={8}><Spinner color="brand.500" /></Center>
        ) : expenses.length === 0 ? (
          <Text color="text.muted">No expenses in this period.</Text>
        ) : (
          <>
            <TransactionList rows={expPage.pageItems} kind="expense" baseCurrency={baseCurrency}
              mutate={mutate} reload={reload} />
            <Paginator page={expPage.page} count={expPage.count} onPage={expPage.setPage} />
          </>
        )}
      </CardBody></Card>

      <Card><CardBody>
        <CardHeader icon={Repeat} title="Recurring" mb={activeRecurring.length ? 4 : 0}
          subtitle={subsMonthly > 0 ? `${formatMoney(subsMonthly, baseCurrency)}/mo` : undefined}
          action={<Button size="xs" variant="ghost" onClick={() => navigate('/recurring')}>Manage</Button>} />
        {activeRecurring.length === 0 ? (
          <Text color="text.muted" fontSize="sm">
            No recurring entries yet. Add subscriptions and bills to see them here.
          </Text>
        ) : (
          <>
            <List spacing={0}>
              {recPage.pageItems.map((r, i) => (
                <ListItem key={r.id}>
                  {i > 0 && <Divider />}
                  <HStack py={2.5} spacing={3}>
                    <Stack spacing={0} flex="1" minW={0}>
                      <Text fontWeight="600" noOfLines={1}>
                        {r.description || r.categories?.name || (r.kind === 'income' ? 'Income' : 'Expense')}
                      </Text>
                      <Text fontSize="xs" color="text.muted">
                        {frequencyLabel(r)} · next {shortDate(r.next_run)}
                      </Text>
                    </Stack>
                    <RowAmount color={r.kind === 'income' ? 'status.positive' : 'text.primary'}>
                      {formatMoney(r.amount_minor, r.currency)}
                    </RowAmount>
                  </HStack>
                </ListItem>
              ))}
            </List>
            <Paginator page={recPage.page} count={recPage.count} onPage={recPage.setPage} />
          </>
        )}
      </CardBody></Card>
    </Stack>
  )
}
