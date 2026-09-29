import { Fragment, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { addEntryLink } from '../../shared/lib/addLinks.js'
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
import { formatMoney, minorFactor, formatSigned } from '../../shared/lib/currency.js'
import { lastMonths, monthName as nameOfMonth, shortDate } from '../../shared/lib/dates.js'
import { isSavingsRow } from '../../shared/lib/savings.js'
import { useCategories } from '../../shared/lib/categories.js'
import { useRecurring } from '../recurring/recurring.js'
import { frequencyLabel } from '../recurring/recurringMath.js'
import { useGoals, useSavingsBalance } from './savings.js'
import {
  anchoredSeries, changeChip, potSeries, savingsCategoryOf, savingsStacks, seriesLength, totalSourceNote, wholeMoney,
} from './savingsMath.js'
import GoalsCard from './GoalsCard.jsx'
import SavingsHistory from './SavingsHistory.jsx'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'
import { entryName } from '../../shared/lib/categoryName.js'

// The Savings page: the pot (its all-time total and month-end line), this
// month's flow and the savings that repeat, the goals, and the history of
// everything that moved the pot. Money is in the base currency, each entry at
// its captured rate. Before anything was ever saved, it explains how savings
// work instead. Live: every read here refetches on changes (useOwnedQuery).
export default function Savings() {
  const navigate = useNavigate()
  const t = useT('savings')
  const sideways = useShortLandscape()
  const { moves, total, savingsIds, baseCurrency, loading, error, reload } = useSavingsBalance()
  const goals = useGoals()
  const { rules } = useRecurring()
  const { categories } = useCategories('income')

  // "Add to savings": a new income entry in the user's savings category (and
  // "Make it automatic": the same with Repeat on).
  const savingsCategory = savingsCategoryOf(categories)
  const addLink = (repeat) => addEntryLink({ kind: 'income', category: savingsCategory, repeat })
  const add = () => navigate(addLink(false))

  const series = useMemo(() => {
    const n = seriesLength(moves)
    return n ? potSeries(moves, savingsIds, baseCurrency, lastMonths(n)) : []
  }, [moves, savingsIds, baseCurrency])
  const line = useMemo(() => anchoredSeries(series, total), [series, total])
  const month = series[series.length - 1] ?? { fromIncome: 0, received: 0, fromSavings: 0, net: 0 }
  const savingRules = useMemo(
    () => rules.filter((r) => r.is_active && isSavingsRow(r, savingsIds)), [rules, savingsIds])

  let body
  if (error) body = <Panel><QueryError error={error} onRetry={reload} what={t('what')} /></Panel>
  else if (loading) body = <SavingsSkeleton />
  else if (moves.length === 0 && total.source === 'entries') body = <FirstSavings add={add} auto={addLink(true)} goals={goals} />
  else {
    const card = {
      pot: <PotCard total={total} month={month} series={line} currency={baseCurrency} add={add} strip={sideways} />,
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
      <PageHeader title={t('title')} />
      {body}
    </Stack>
  )
}

function AddButton({ add, ...props }) {
  const t = useT('savings')
  return <Button leftIcon={<Plus size={16} />} onClick={add} {...props}>{t('add')}</Button>
}

// ── The pot ─────────────────────────────────────────────────────────────────
// Its total, this month's chip, the month-end line and "Add to savings".
// `strip` (a phone held sideways): the figures and the button beside the
// chart rather than over it.
function PotCard({ total, month, series, currency, add, strip }) {
  const t = useT('savings')
  const pot = total.minor
  const since = series.length ? t('pot.since', { month: series[0].label, count: series.length }) : null
  const figures = (
    <Box minW={0}>
      <Figure label={t('pot.label')} size="hero"
        value={formatSigned(pot, currency)} tone={pot < 0 ? 'negative' : 'default'} />
      <Text fontSize="xs" color="text.muted" mt={1}>{totalSourceNote(total.source)}</Text>
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
          {series.length > 0 && <PotArea series={series} currency={currency} h="120px" />}
        </SimpleGrid>
      </Panel>
    )
  }
  return (
    <Panel>
      {figures}
      {series.length > 0 && <PotArea series={series} currency={currency} h="150px" />}
      <AddButton add={add} w="full" mt={3} />
    </Panel>
  )
}

// This month's change: green "+€X this month" when the pot grew, otherwise a
// muted, neutral chip (what was spent from it, or no change). Never red.
// `small` (the sideways strip) steps the text down so it stays on one line.
function MonthChip({ flow, currency, small }) {
  const t = useT('savings')
  const fontSize = small ? 'xs' : 'sm'
  const chip = changeChip(flow)
  if (chip.kind === 'up') {
    return (
      <HStack spacing={1} px={2} py={0.5} borderRadius="full" bg="green.50" _dark={{ bg: 'whiteAlpha.100' }}
        color="status.positive" fontSize={fontSize} fontWeight="700">
        <ArrowUpRight size={15} aria-hidden />
        <Text>{t('chip.up', { amount: wholeMoney(chip.minor, currency) })}</Text>
      </HStack>
    )
  }
  return (
    <HStack spacing={1.5} px={2} py={0.5} borderRadius="full" bg="bg.subtle" color="text.muted"
      fontSize={fontSize} fontWeight="600" minW={0}>
      <ShoppingBag size={14} aria-hidden />
      <Text>
        {chip.kind === 'spent' ? t('chip.spent', { amount: wholeMoney(chip.minor, currency) }) : t('chip.none')}
      </Text>
    </HStack>
  )
}

// The pot's month-end totals as a soft coral area (the brand's chart colour).
function PotArea({ series, currency, h }) {
  const t = useT('savings')
  const chart = useChartTheme()
  const [coral] = useToken('colors', ['brand.500'])
  const factor = minorFactor(currency)
  const data = series.map((s) => ({ label: s.label, pot: s.pot / factor }))
  return (
    <Box h={h} mx={-1} minW={0} role="img"
      aria-label={t('pot.chart', { points: series.map((s) => `${s.label}: ${formatMoney(s.pot, currency)}`).join(', ') })}>
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
          <Tooltip formatter={(v) => formatMoney(Math.round(v * factor), currency)} {...chart.tooltip} />
          <Area type="monotone" dataKey="pot" name={t('pot.series')} stroke={coral} strokeWidth={2.5} fill="url(#potFill)"
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
  const t = useT('savings')
  const signed = (m) => signedAmount(m, (x) => formatMoney(x, currency))
  const net = signed(month.net)
  const monthName = nameOfMonth()
  return (
    <Panel title={t('month.title')} subtitle={monthName}>
      <BalanceGrid columns={3}>
        <BalanceTile label={t('month.fromIncome')} value={signed(month.fromIncome).text} tone={month.fromIncome ? 'positive' : 'muted'} />
        <BalanceTile label={t('month.received')} value={signed(month.received).text} tone={month.received ? 'positive' : 'muted'} />
        <BalanceTile label={t('month.fromSavings')} value={signed(-month.fromSavings).text}
          tone={month.fromSavings ? 'default' : 'muted'} />
      </BalanceGrid>
      {/* No red on a savings page: money taken out is shown plainly, only growth in green. */}
      <Figure layout="inline" label={t('month.net')} value={net.text} tone={month.net > 0 ? 'positive' : 'default'} mt={3} />
      {rules.length > 0 && (
        <>
          <Divider borderColor="border.default" my={3} />
          <SectionLabel mb={1}>{t('month.repeating')}</SectionLabel>
          {rules.map((r) => (
            <ItemRow key={r.id} icon={Repeat} chevron onClick={() => navigate(`/recurring/${r.id}`)}
              title={`${formatMoney(r.amount_minor, r.currency)} ${frequencyLabel(r)}`}
              meta={t('month.next', { name: entryName(r, t('fallbackName')), date: shortDate(r.next_run) })} />
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
// Each kind's words are how.<id>.title / .meta.
const HOW = [
  { id: 'fromIncome', icon: Wallet },
  { id: 'received', icon: Gift },
  { id: 'fromSavings', icon: ShoppingBag },
]

function FirstSavings({ add, auto, goals }) {
  const navigate = useNavigate()
  const t = useT('savings')
  return (
    <>
      <Panel>
        <EmptyState title={t('empty.title')} text={t('empty.text')}
          actions={<>
            <AddButton add={add} />
            {goals.goals.length === 0 && (
              <Button variant="outline" leftIcon={<Target size={16} />}
                onClick={() => navigate('/savings/goals/new')}>{t('empty.setGoal')}</Button>
            )}
          </>} />
      </Panel>
      {goals.goals.length > 0 && <GoalsCard {...goals} />}
      <Panel title={t('how.title')} subtitle={t('how.subtitle')}>
        <Stack spacing={1}>
          {HOW.map((h) => (
            <ItemRow key={h.id} icon={h.icon} title={t(`how.${h.id}.title`)} meta={t(`how.${h.id}.meta`)} />
          ))}
        </Stack>
        <Divider borderColor="border.default" my={3} />
        <ItemRow icon={Repeat} title={t('how.auto.title')} meta={t('how.auto.meta')}
          onClick={() => navigate(auto)} chevron />
      </Panel>
    </>
  )
}
