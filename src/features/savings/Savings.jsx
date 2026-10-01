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
import EmptyState from '../../shared/ui/EmptyState.jsx'
import QueryError from '../../shared/ui/QueryError.jsx'
import { SkeletonBlock, SkeletonFigure, SkeletonRegion, SkeletonRows } from '../../shared/ui/Skeleton.jsx'
import { useChartTheme } from '../../shared/ui/useChartTheme.jsx'
import { useShortLandscape } from '../../shared/ui/useShortLandscape.js'
import { NARROW_STACKS } from '../../shared/ui/narrowStacks.js'
import { formatMoney, minorFactor } from '../../shared/lib/currency.js'
import { useCategories } from '../../shared/lib/categories.js'
import { useRecurring } from '../recurring/recurring.js'
import { useGoals, useSavingsBalance } from './savings.js'
import { savingsCategoryOf, savingsPage, savingsStacks } from './savingsMath.js'
import GoalsCard from './GoalsCard.jsx'
import SavingsHistory from './SavingsHistory.jsx'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'
import MoreBackButton from '../../shared/ui/MoreBackButton.jsx'

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

  // Every figure and word of the pot's card and this month's (savingsPage).
  const page = useMemo(
    () => savingsPage({ moves, total, savingsIds, baseCurrency, rules }), [moves, total, savingsIds, baseCurrency, rules])

  let body
  if (error) body = <Panel><QueryError error={error} onRetry={reload} what={t('what')} /></Panel>
  else if (loading) body = <SavingsSkeleton />
  else if (page.first) body = <FirstSavings add={add} auto={addLink(true)} goals={goals} />
  else {
    const card = {
      pot: <PotCard pot={page.pot} currency={baseCurrency} add={add} strip={sideways} />,
      month: <MonthCard month={page.month} />,
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
      <PageHeader leading={<MoreBackButton />} title={t('title')} />
      {body}
    </Stack>
  )
}

function AddButton({ add, ...props }) {
  const t = useT('savings')
  return <Button leftIcon={<Plus size={16} />} onClick={add} {...props}>{t('add')}</Button>
}

// ── The pot ─────────────────────────────────────────────────────────────────
// Its total, this month's chip, the month-end line and "Add to savings"
// (potCardParts). `strip` (a phone held sideways): the figures and the
// button beside the chart rather than over it.
function PotCard({ pot, currency, add, strip }) {
  const t = useT('savings')
  const figures = (
    <Box minW={0}>
      <Figure label={t('pot.label')} size="hero" value={pot.total} tone={pot.tone} />
      <Text fontSize="xs" color="text.muted" mt={1}>{pot.note}</Text>
      <HStack justify="space-between" mt={2} spacing={2} flexWrap="wrap" rowGap={1}>
        <MonthChip chip={pot.chip} small={strip} />
        {pot.since && <Text fontSize="xs" color="text.muted">{pot.since}</Text>}
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
          {pot.points.length > 0 && <PotArea pot={pot} currency={currency} h="120px" />}
        </SimpleGrid>
      </Panel>
    )
  }
  return (
    <Panel>
      {figures}
      {pot.points.length > 0 && <PotArea pot={pot} currency={currency} h="150px" />}
      <AddButton add={add} w="full" mt={3} />
    </Panel>
  )
}

// This month's change: green "+€X this month" when the pot grew, otherwise a
// muted, neutral chip (what was spent from it, or no change). Never red.
// `small` (the sideways strip) steps the text down so it stays on one line.
function MonthChip({ chip, small }) {
  const fontSize = small ? 'xs' : 'sm'
  if (chip.kind === 'up') {
    return (
      <HStack spacing={1} px={2} py={0.5} borderRadius="full" bg="green.50" _dark={{ bg: 'whiteAlpha.100' }}
        color="status.positive" fontSize={fontSize} fontWeight="700">
        <ArrowUpRight size={15} aria-hidden />
        <Text>{chip.text}</Text>
      </HStack>
    )
  }
  return (
    <HStack spacing={1.5} px={2} py={0.5} borderRadius="full" bg="bg.subtle" color="text.muted"
      fontSize={fontSize} fontWeight="600" minW={0}>
      <ShoppingBag size={14} aria-hidden />
      <Text>{chip.text}</Text>
    </HStack>
  )
}

// The pot's month-end totals as a soft coral area (the brand's chart colour).
function PotArea({ pot, currency, h }) {
  const t = useT('savings')
  const chart = useChartTheme()
  const [coral] = useToken('colors', ['brand.500'])
  const factor = minorFactor(currency)
  const data = pot.points.map((p) => ({ label: p.label, pot: p.value }))
  return (
    <Box h={h} mx={-1} minW={0} role="img" aria-label={pot.chart}>
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
// savings that repeat (monthCardParts).
function MonthCard({ month }) {
  const navigate = useNavigate()
  const t = useT('savings')
  return (
    <Panel title={t('month.title')} subtitle={month.subtitle}>
      <BalanceGrid columns={3}>
        {month.tiles.map((tile) => <BalanceTile key={tile.key} label={tile.label} value={tile.text} tone={tile.tone} />)}
      </BalanceGrid>
      {/* No red on a savings page: money taken out is shown plainly, only growth in green. */}
      <Figure layout="inline" label={t('month.net')} value={month.net.text} tone={month.net.tone} mt={3} />
      {month.repeating.length > 0 && (
        <>
          <Divider borderColor="border.default" my={3} />
          <SectionLabel mb={1}>{t('month.repeating')}</SectionLabel>
          {month.repeating.map((r) => (
            <ItemRow key={r.id} icon={Repeat} chevron onClick={() => navigate(`/recurring/${r.id}`)}
              title={r.title} meta={r.meta} />
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
