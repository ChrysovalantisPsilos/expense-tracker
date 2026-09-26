import { Fragment, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box, Button, Divider, Flex, HStack, SimpleGrid, Stack, Text, useToken,
} from '@chakra-ui/react'
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts'
import {
  ArrowUpRight, Gift, Plus, Repeat, ShoppingBag, Target, Wallet,
} from 'lucide-react'
import PageHeader from '../../shared/ui/PageHeader.jsx'
import Panel from '../../shared/ui/kit/Panel.jsx'
import Figure from '../../shared/ui/kit/Figure.jsx'
import ItemRow from '../../shared/ui/kit/ItemRow.jsx'
import SectionLabel from '../../shared/ui/kit/SectionLabel.jsx'
import { BalanceGrid, BalanceTile } from '../../shared/ui/kit/Balances.jsx'
import { signedAmount } from '../../shared/ui/kit/kitMath.js'
import EmptyState from '../../shared/ui/EmptyState.jsx'
import QueryError from '../../shared/ui/QueryError.jsx'
import { SkeletonBlock, SkeletonFigure, SkeletonRegion, SkeletonRows } from '../../shared/ui/Skeleton.jsx'
import { useChartTheme } from '../../shared/ui/useChartTheme.jsx'
import { useShortLandscape } from '../../shared/ui/useShortLandscape.js'
import { NARROW_STACKS } from '../../shared/ui/narrowStacks.js'
import { formatMoney, minorFactor } from '../../shared/lib/currency.js'
import { lastMonths, shortDate } from '../../shared/lib/dates.js'
import { isSavingsRow } from '../../shared/lib/savings.js'
import { useCategories } from '../transactions/useData.js'
import { useRecurring } from '../recurring/recurring.js'
import { frequencyLabel } from '../recurring/recurringMath.js'
import { useGoals, useSavingsMoves } from './savings.js'
import {
  changeChip, potSeries, savingsCategoryOf, savingsStacks, seriesLength, wholeMoney,
} from './savingsMath.js'
import GoalsCard from './GoalsCard.jsx'
import SavingsHistory from './SavingsHistory.jsx'

const money = (minor, currency) => formatMoney(minor, currency)

// The Savings page: the pot (its all-time total and month-end line), this
// month's flow and the savings that repeat, the goals, and the history of
// everything that moved the pot. Money is in the base currency, each entry at
// its captured rate. Before anything was ever saved, it explains how savings
// work instead. Live: every read here refetches on changes (useOwnedQuery).
export default function Savings() {
  const navigate = useNavigate()
  const sideways = useShortLandscape()
  const { moves, pot, savingsIds, baseCurrency, loading, error, reload } = useSavingsMoves()
  const goals = useGoals()
  const { rules } = useRecurring()
  const { categories } = useCategories('income')

  // "Add to savings": a new income entry in the user's savings category.
  const savingsCategory = savingsCategoryOf(categories)
  const add = () => navigate(`/transactions/new?kind=income${savingsCategory ? `&category=${savingsCategory}` : ''}`)

  const series = useMemo(() => {
    const n = seriesLength(moves)
    return n ? potSeries(moves, savingsIds, baseCurrency, lastMonths(n)) : []
  }, [moves, savingsIds, baseCurrency])
  const month = series[series.length - 1] ?? { fromIncome: 0, received: 0, fromSavings: 0, net: 0 }
  const savingRules = useMemo(
    () => rules.filter((r) => r.is_active && isSavingsRow(r, savingsIds)), [rules, savingsIds])

  let body
  if (error) body = <Panel><QueryError error={error} onRetry={reload} what="your savings" /></Panel>
  else if (loading) body = <SavingsSkeleton />
  else if (moves.length === 0) body = <FirstSavings add={add} goals={goals} />
  else {
    const card = {
      pot: <PotCard pot={pot} month={month} series={series} currency={baseCurrency} add={add} strip={sideways} />,
      month: <MonthCard month={month} rules={savingRules} currency={baseCurrency} />,
      goals: <GoalsCard {...goals} />,
      history: <SavingsHistory moves={moves} savingsIds={savingsIds} baseCurrency={baseCurrency} reload={reload} />,
    }
    const show = (ids) => ids.map((id) => <Fragment key={id}>{card[id]}</Fragment>)
    const stacks = savingsStacks({ sideways })
    const gap = sideways ? 3 : 5
    body = (
      <>
        {show(stacks.strip)}
        <Flex gap={gap} align="start" direction={sideways ? 'row' : { base: 'column', md: 'row' }}
          sx={sideways ? NARROW_STACKS : undefined}>
          <Stack spacing={gap} flex="1" minW={0} w="full">{show(stacks.left)}</Stack>
          <Stack spacing={gap} flex="1" minW={0} w="full">{show(stacks.right)}</Stack>
        </Flex>
      </>
    )
  }

  return (
    <Stack spacing={sideways ? 3 : 5}>
      <PageHeader title="Savings" />
      {body}
    </Stack>
  )
}

function AddButton({ add, ...props }) {
  return <Button leftIcon={<Plus size={16} />} onClick={add} {...props}>Add to savings</Button>
}

// ── The pot ─────────────────────────────────────────────────────────────────
// Its total, this month's chip, the month-end line and "Add to savings".
// `strip` (a phone held sideways): the figures and the button beside the
// chart rather than over it.
function PotCard({ pot, month, series, currency, add, strip }) {
  const since = series.length ? `since ${series[0].label} · ${series.length} months` : null
  const figures = (
    <Box minW={0}>
      <Figure label="Your savings pot" size="hero"
        value={`${pot < 0 ? '−' : ''}${money(Math.abs(pot), currency)}`} tone={pot < 0 ? 'negative' : 'default'} />
      <HStack justify="space-between" mt={2} spacing={2} flexWrap="wrap" rowGap={1}>
        <MonthChip flow={month} currency={currency} small={strip} />
        {since && <Text fontSize="xs" color="text.muted">{since}</Text>}
      </HStack>
    </Box>
  )
  if (strip) {
    return (
      <Panel>
        <SimpleGrid templateColumns="minmax(0, 1fr) minmax(0, 1fr)" spacing={4} alignItems="center">
          <Stack spacing={3} minW={0}>
            {figures}
            <AddButton add={add} size="sm" w="full" />
          </Stack>
          <PotArea series={series} currency={currency} h="120px" />
        </SimpleGrid>
      </Panel>
    )
  }
  return (
    <Panel>
      {figures}
      <PotArea series={series} currency={currency} h="150px" />
      <AddButton add={add} w="full" mt={3} />
    </Panel>
  )
}

// This month's change: green "+€X this month" when the pot grew, otherwise a
// muted, neutral chip (what was spent from it, or no change). Never red.
// `small` (the sideways strip) steps the text down so it stays on one line.
function MonthChip({ flow, currency, small }) {
  const fontSize = small ? 'xs' : 'sm'
  const chip = changeChip(flow)
  if (chip.kind === 'up') {
    return (
      <HStack spacing={1} px={2} py={0.5} borderRadius="full" bg="green.50" _dark={{ bg: 'whiteAlpha.100' }}
        color="status.positive" fontSize={fontSize} fontWeight="700">
        <ArrowUpRight size={15} aria-hidden />
        <Text>+{wholeMoney(chip.minor, currency)} this month</Text>
      </HStack>
    )
  }
  return (
    <HStack spacing={1.5} px={2} py={0.5} borderRadius="full" bg="bg.subtle" color="text.muted"
      fontSize={fontSize} fontWeight="600" minW={0}>
      <ShoppingBag size={14} aria-hidden />
      <Text>
        {chip.kind === 'spent' ? `${wholeMoney(chip.minor, currency)} spent from savings this month` : 'No change this month'}
      </Text>
    </HStack>
  )
}

// The pot's month-end totals as a soft coral area (the brand's chart colour).
function PotArea({ series, currency, h }) {
  const chart = useChartTheme()
  const [coral] = useToken('colors', ['brand.500'])
  const factor = minorFactor(currency)
  const data = series.map((s) => ({ label: s.label, pot: s.pot / factor }))
  return (
    <Box h={h} mx={-1} minW={0} role="img"
      aria-label={`Your savings pot at the end of each month, ${series.map((s) => `${s.label}: ${money(s.pot, currency)}`).join(', ')}`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <defs>
            <linearGradient id="potFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={coral} stopOpacity={0.32} />
              <stop offset="100%" stopColor={coral} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} tick={chart.tick}
            interval="preserveStartEnd" padding={{ left: 14, right: 14 }} />
          <YAxis hide domain={[(min) => Math.min(0, min), 'dataMax']} />
          <Tooltip formatter={(v) => money(Math.round(v * factor), currency)} {...chart.tooltip} />
          <Area type="monotone" dataKey="pot" name="Pot" stroke={coral} strokeWidth={2.5} fill="url(#potFill)"
            dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </Box>
  )
}

// ── This month ──────────────────────────────────────────────────────────────
// Where this month's savings came from and went, the net change, and the
// savings that repeat (active rules in a savings category).
function MonthCard({ month, rules, currency }) {
  const navigate = useNavigate()
  const signed = (m) => signedAmount(m, (x) => money(x, currency))
  const net = signed(month.net)
  const monthName = new Date().toLocaleDateString('en-US', { month: 'long' })
  return (
    <Panel title="This month" subtitle={monthName}>
      <BalanceGrid columns={3}>
        <BalanceTile label="From income" value={signed(month.fromIncome).text} tone={month.fromIncome ? 'positive' : 'muted'} />
        <BalanceTile label="Received" value={signed(month.received).text} tone={month.received ? 'positive' : 'muted'} />
        <BalanceTile label="From savings" value={signed(-month.fromSavings).text}
          tone={month.fromSavings ? 'default' : 'muted'} />
      </BalanceGrid>
      {/* No red on a savings page: money taken out is shown plainly, only growth in green. */}
      <Figure layout="inline" label="Net change" value={net.text} tone={month.net > 0 ? 'positive' : 'default'} mt={3} />
      {rules.length > 0 && (
        <>
          <Divider borderColor="border.default" my={3} />
          <SectionLabel mb={1}>Repeating</SectionLabel>
          {rules.map((r) => (
            <ItemRow key={r.id} icon={Repeat} chevron onClick={() => navigate(`/recurring/${r.id}`)}
              title={`${money(r.amount_minor, r.currency)} ${frequencyLabel(r)}`}
              meta={`${r.description || r.categories?.name || 'Savings'} · next on ${shortDate(r.next_run)}`} />
          ))}
        </>
      )}
    </Panel>
  )
}

// ── Loading ─────────────────────────────────────────────────────────────────
function SavingsSkeleton() {
  return (
    <SkeletonRegion>
      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={5}>
        <Panel>
          <SkeletonFigure size="hero" />
          <SkeletonBlock h="130px" radius="lg" mt={4} />
        </Panel>
        <Panel><SkeletonRows count={4} /></Panel>
      </SimpleGrid>
    </SkeletonRegion>
  )
}

// ── Nothing saved yet ───────────────────────────────────────────────────────
const HOW = [
  { icon: Wallet, title: 'Saved from your income', meta: 'Money you set aside from what you earn. It lowers what’s left over that month.' },
  { icon: Gift, title: 'Received into savings', meta: 'Interest, a gift or a refund paid straight in. Your month’s net stays as it is.' },
  { icon: ShoppingBag, title: 'Paid from savings', meta: 'A big buy the pot covers. It’s still spending, but it doesn’t eat into your month.' },
]

function FirstSavings({ add, goals }) {
  const navigate = useNavigate()
  return (
    <>
      <Panel>
        <EmptyState title="Start your savings pot"
          text="Everything you put aside adds up here, month by month, so you can watch it grow and aim it at a goal."
          actions={<>
            <AddButton add={add} />
            {goals.goals.length === 0 && (
              <Button variant="outline" leftIcon={<Target size={16} />}
                onClick={() => navigate('/savings/goals/new')}>Set a goal</Button>
            )}
          </>} />
      </Panel>
      {goals.goals.length > 0 && <GoalsCard {...goals} />}
      <Panel title="How savings work" subtitle="Add an entry in the Savings category">
        <Stack spacing={1}>
          {HOW.map((h) => <ItemRow key={h.title} icon={h.icon} title={h.title} meta={h.meta} />)}
        </Stack>
        <Divider borderColor="border.default" my={3} />
        <ItemRow icon={Repeat} title="Make it automatic" meta="Set an amount to go in every month"
          onClick={() => navigate('/recurring/new?kind=income')} chevron />
      </Panel>
    </>
  )
}
