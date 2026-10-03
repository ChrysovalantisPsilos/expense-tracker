import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import {
  SimpleGrid, Grid, Box, Flex, Text, Stack, HStack, IconButton, Button,
  Table, Thead, Tbody, Tr, Th, Td, Tooltip as CkTooltip, Select, Link,
} from '@chakra-ui/react'
import { ChartBarDecreasing, ChevronDown, ChevronUp, PiggyBank, Table as TableIcon, ReceiptText, Users, Wallet } from 'lucide-react'
import TransactionList from '../transactions/TransactionList.jsx'
import FirstEntry from '../transactions/FirstEntry.jsx'
import { isFirstRun, listHeading } from '../transactions/listHeading.js'
import { useTransactions, useOldestTransactionDate } from '../../shared/lib/transactions.js'
import { buildPeriods, isThisMonth, thisMonthPeriod } from '../../shared/lib/periods.js'
import { linkBuckets } from '../../shared/lib/categoryLinks.js'
import { useSavingsIds } from '../../shared/lib/categories.js'
import { usePrefetchMyGroups } from '../groups/myGroups.js'
import { useGroupFlow } from '../groups/groups.js'
import { monthName, today } from '../../shared/lib/dates.js'
import { expectedEnd, paydayHints, payMonthWindow } from '../../shared/lib/payCalendar.js'
import { useProfile } from '../../shared/lib/ProfileProvider.jsx'
import { useRecurring, useRuleRates } from '../recurring/recurring.js'
import { formatMoney } from '../../shared/lib/currency.js'
import { spendRows } from '../../shared/lib/spread.js'
import { rulesInBase } from '../../shared/lib/ruleFx.js'
import { bucketLabel, bucketLabels } from '../../shared/lib/txnRollup.js'
import { STORAGE_KEYS } from '../../shared/lib/keys.js'
import { usePaged } from '../../shared/ui/usePaged.js'
import Paginator from '../../shared/ui/Paginator.jsx'
import PageHeader from '../../shared/ui/PageHeader.jsx'
import CategoryBadge from '../../shared/ui/CategoryBadge.jsx'
import Panel from '../../shared/ui/kit/Panel.jsx'
import { CardEmptyState } from '../../shared/ui/EmptyState.jsx'
import Figure from '../../shared/ui/kit/Figure.jsx'
import ItemRow from '../../shared/ui/kit/ItemRow.jsx'
import IconTile from '../../shared/ui/kit/IconTile.jsx'
import { BalanceTile } from '../../shared/ui/kit/Balances.jsx'
import ProgressRow from '../../shared/ui/kit/ProgressRow.jsx'
import SumSteps from '../../shared/ui/SumSteps.jsx'
import { signedAmount } from '../../shared/ui/kit/kitMath.js'
import { categoryBars } from './categoryBars.js'
import {
  periodTotals, periodProjection, paidRuleIds, projectedTotals, groupFlow, overviewNotes, netSum, savingsLine, barLines, homeLists, visibleBars,
  TOP_CATEGORIES, homeCards, homeStacks,
} from './dashboardMath.js'
import BudgetsCard from '../budgets/BudgetsCard.jsx'
import VoucherCard from '../vouchers/VoucherCard.jsx'
import SubscriptionsCard from '../recurring/SubscriptionsCard.jsx'
import QueryError from '../../shared/ui/QueryError.jsx'
import { InfoBox, InfoButton, useInfoToggle } from '../../shared/ui/InfoToggle.jsx'
import { useShortLandscape } from '../../shared/ui/useShortLandscape.js'
import { NARROW_STACKS } from '../../shared/ui/narrowStacks.js'
import { SkeletonBlock, SkeletonFigure, SkeletonRegion, SkeletonRows } from '../../shared/ui/Skeleton.jsx'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'
import MonthSummary, { SummaryTitle } from '../ai/MonthSummary.jsx'
import { useMonthSummary } from '../ai/ai.js'
import { overviewWords } from '../ai/aiMath.js'
import CardHeader from '../../shared/ui/CardHeader.jsx'
import SegmentedControl from '../../shared/ui/SegmentedControl.jsx'

const VIEW_KEY = STORAGE_KEYS.overviewView
const TAB_KEY = STORAGE_KEYS.overviewTab

export default function Dashboard() {
  const t = useT('dashboard')
  const tc = useT()
  const navigate = useNavigate()
  // What a card that needs the transactions shows when they couldn't load.
  const unavailable = <Text color="text.muted" fontSize="sm">{t('unavailable')}</Text>
  const { baseCurrency, separateYearly, salaryShift, payCalendar: cal, lastPayDay } = useProfile()
  const { rules, loading: rulesLoading, error: rulesError, reload: reloadRules } = useRecurring()
  // Foreign rules count at today's ECB rate (the projection, the Recurring card).
  const ruleFx = useRuleRates(rules, baseCurrency)
  // undefined until known (null: no transactions at all)
  const [oldest, recheckOldest] = useOldestTransactionDate()
  // The months are pay months with the salary setting on (payCalendar).
  const periods = useMemo(() => buildPeriods(oldest, new Date(), { cal }), [oldest, cal])
  // Default to this month (null): the pay month holding today, which the
  // calendar can move (29 Sep after payday is October).
  const [picked, setPeriodValue] = useState(null)
  const period = (picked && periods.find((p) => p.value === picked)) || thisMonthPeriod(new Date(), cal)
  const periodValue = period.value

  // `spread`: yearly subscriptions paid before the period still count their
  // share of it (totals only — the list shows what was paid in the period).
  const { rows, loading: rowsLoading, error, reload, mutate } = useTransactions({
    from: period.from ?? undefined, to: period.to ?? undefined, spread: true,
  })
  // The money groups really moved in the period (paid for others, paid for
  // you, settlements): the Net counts it (dashboardMath.groupFlow).
  const { data: moves, loading: movesLoading, error: movesError, reload: reloadMoves } = useGroupFlow({
    from: period.from ?? undefined, to: period.to ?? undefined,
  })
  // Savings entries (0084) aren't income: every figure below waits for the
  // user's savings categories so none flashes with them counted.
  const { savingsIds, loading: savingsLoading } = useSavingsIds()
  const loading = rowsLoading || savingsLoading
  // The overview's figures also wait for the group moves (one error, one
  // Retry for both reads).
  const overviewLoading = loading || movesLoading
  const overviewError = error ?? movesError
  const reloadOverview = () => Promise.all([reload(), reloadMoves()])
  // Warm the Add form's "Who's it for?" groups once Home has loaded.
  usePrefetchMyGroups(!loading)
  // Recheck whenever the (live) transaction rows change, so importing older
  // data extends the period dropdown without a reload. Cheap: 1-row query.
  useEffect(recheckOldest, [rows, recheckOldest])
  const [view, setView] = useState(() => localStorage.getItem(VIEW_KEY) || 'chart')
  function chooseView(v) { setView(v); localStorage.setItem(VIEW_KEY, v) }

  // Spread yearly charges count as their monthly parts in every total — or,
  // when the user keeps them separate, not at all (the Recurring card lists them).
  const spend = useMemo(
    () => spendRows(rows, baseCurrency, period.from, period.to, { separateYearly, cal }),
    [rows, baseCurrency, period.from, period.to, separateYearly, cal])
  const totals = useMemo(() => periodTotals(spend, baseCurrency, savingsIds), [spend, baseCurrency, savingsIds])
  const { byCategory, bucketRow } = totals
  // The expenses and the income paid in the period (homeLists).
  const { expenses, income } = useMemo(
    () => homeLists(rows, { from: period.from, to: period.to, savingsIds }),
    [rows, savingsIds, period.from, period.to])
  // Each bar drills down to its expenses for this period (a group share to its
  // group); the folded "Other" merges several buckets, so it has no link.
  // Every category, largest first (no fold: "Show all" reveals the tail).
  // Each bar is shown by its label (a default category in the app's language).
  const bars = useMemo(() => {
    const labels = bucketLabels(bucketRow.values())
    return linkBuckets(categoryBars(byCategory, Infinity), spend, period)
      .map((c) => ({ ...c, label: bucketLabel(c, labels) }))
  }, [byCategory, bucketRow, spend, period])
  const lines = useMemo(() => barLines(bars, spend, baseCurrency), [bars, spend, baseCurrency])
  const [showAllBars, setShowAllBars] = useState(false)
  const shownBars = visibleBars(bars, showAllBars)

  // Fold not-yet-charged recurring into the period's spend/income projection,
  // but only for periods that are still ongoing (end today or later). Past
  // periods and "all time" stay purely actual. With pay months the
  // projection ends the day before the next salary is expected
  // (payCalendar.expectedEnd), and a monthly charge already paid in this pay
  // month isn't counted again (paidRuleIds).
  const todayISO = useMemo(() => today(), [])
  const proj = useMemo(() => {
    const end = cal && period.open
      ? expectedEnd(payMonthWindow(period.key, cal), cal, paydayHints(rules, salaryShift, lastPayDay)) : period.to
    return periodProjection(rulesInBase(rules, baseCurrency, ruleFx.rates).rules, { from: period.from, to: end },
      todayISO, separateYearly, savingsIds,
      cal ? { cal, paidRules: paidRuleIds(rows, { from: period.from, to: period.to }) } : undefined)
  }, [rules, baseCurrency, ruleFx.rates, period, todayISO, separateYearly, savingsIds, cal, salaryShift, lastPayDay, rows])
  const flow = useMemo(() => groupFlow(moves, baseCurrency, { from: period.from, to: period.to }),
    [moves, baseCurrency, period.from, period.to])
  const figures = projectedTotals(totals, proj, flow)
  const { spentTotal, earnedTotal, netTotal } = figures
  const net = signedAmount(netTotal, (m) => formatMoney(m, baseCurrency))
  const saved = savingsLine(totals.saved, figures.fromSavingsTotal, period, baseCurrency)

  // Paginate the expenses (10/page), back to page 1 when the period changes.
  const expPage = usePaged(expenses, 10, periodValue)
  const expHead = listHeading({
    kind: 'expense', periodLabel: period.label, count: expenses.length, loading, failed: !!error,
  })
  const incPage = usePaged(income, 10, periodValue)
  const incHead = listHeading({
    kind: 'income', periodLabel: period.label, count: income.length, loading, failed: !!error,
  })
  const firstRun = isFirstRun({ loading, failed: !!error, count: rows.length, oldest })
  // A phone held sideways: the overview is one strip (Spent | Income · Net)
  // over two stacks of cards (homeStacks).
  const sideways = useShortLandscape()
  const overviewGrid = sideways ? { templateColumns: '2fr 3fr' } : { columns: { base: 1, md: 2 } }

  const info = useInfoToggle()

  // "Month in plain words" (Settings → AI helpers): This month's overview can
  // show it instead of the numbers. The choice is kept per viewer (TAB_KEY).
  const summary = useMonthSummary()
  const [tab, setTab] = useState(() => { try { return localStorage.getItem(TAB_KEY) } catch { return null } })
  function chooseTab(v) {
    setTab(v)
    try { localStorage.setItem(TAB_KEY, v) } catch { /* private mode: kept until reload */ }
  }
  const words = overviewWords({ state: summary.state, thisMonth: isThisMonth(period, new Date(), cal), tab })

  // Every card by id; homeCards / homeStacks decide which show, and where.
  const card = {
    overview: overviewError ? (
        // One error (with Retry) for the reads the figures need, instead of
        // €0.00 totals that look real (the cards below say so for theirs).
        <Panel data-tour="overview"><QueryError error={overviewError} onRetry={reloadOverview} what={t('what')} /></Panel>
      ) : (
      <Panel data-tour="overview">
        {/* With "Month in plain words" on, This month offers Numbers | In
            words (aiMath.overviewWords); on words the header's month becomes
            "✦ September in short". The words share the numbers' grid
            cell, where the numbers stay laid out but hidden, so the card is
            never shorter than Numbers (nothing below jumps) and grows only
            when the words need more room. */}
        {words.offered && (
          <CardHeader title={words.words ? <SummaryTitle month={summary.month} /> : monthName(new Date(`${period.key}-01T00:00`))} action={
            <SegmentedControl label={t('overview.showAs')} value={words.words ? 'words' : 'numbers'} onChange={chooseTab}
              options={[['numbers', t('overview.numbers')], ['words', t('overview.words')]]} />
          } />
        )}
        <Grid>
          <Box gridArea="1 / 1" minW={0} visibility={words.words ? 'hidden' : undefined}>
            {overviewLoading ? <OverviewSkeleton grid={overviewGrid} /> : (
            <SimpleGrid {...overviewGrid} spacing={4} alignItems="center">
              {/* What Spent, Income and the Net fold in sits behind the ⓘ
                  (overviewNotes, netSum). */}
              <Figure size="hero" value={formatMoney(spentTotal, baseCurrency)} label={
                <HStack as="span" spacing={0.5}>
                  <span>{t('overview.spent')}</span>
                  <InfoButton info={info} label={tc('info')} />
                </HStack>
              } />
              <SimpleGrid columns={2} spacing={2}>
                <BalanceTile size="md" label={t('overview.income')} value={formatMoney(earnedTotal, baseCurrency)} tone="positive" />
                <BalanceTile size="md" label={t('overview.net')} value={net.text} tone={net.tone} />
                {/* Savings aren't income (those taken from it lower the net): a row
                    says what was put aside, both kinds, and opens Savings — the
                    same row as Insights' Savings account line. */}
                {saved && (
                  <Box gridColumn="span 2">
                    <ItemRow icon={PiggyBank} title={saved} onClick={() => navigate('/savings')} py={1}
                      meta={<Text as="span" color="accent.fg" fontWeight="600">{t('insights:netWorth.seeSavings')}</Text>} />
                  </Box>
                )}
              </SimpleGrid>
            </SimpleGrid>
            )}
            {!overviewLoading && (
              <InfoBox info={info}>
                <SumSteps {...netSum(figures, baseCurrency)} />
                {overviewNotes({ proj }, baseCurrency).map((line) => <Text key={line} mt={2}>{line}</Text>)}
              </InfoBox>
            )}
          </Box>
          {words.words && <Box gridArea="1 / 1" minW={0}><MonthSummary summary={summary} /></Box>}
        </Grid>
      </Panel>
      ),

    // Nothing logged at all yet: the way to start sits right under the
    // totals, in place of the (empty) Expenses card further down.
    firstEntry: <Panel><FirstEntry /></Panel>,

    categories: (
      <Panel data-tour="categories" icon={ChartBarDecreasing} title={t('categories.title')} action={
          <HStack spacing={1} bg="bg.subtle" p={1} borderRadius="lg">
            <CkTooltip label={t('categories.chart')}>
              <IconButton aria-label={t('categories.chartView')} size="xs" w="42px" icon={<ChartBarDecreasing size={15} />}
                variant={view !== 'table' ? 'solid' : 'ghost'}
                colorScheme={view !== 'table' ? 'brand' : 'gray'}
                onClick={() => chooseView('chart')} />
            </CkTooltip>
            <CkTooltip label={t('categories.table')}>
              <IconButton aria-label={t('categories.tableView')} size="xs" w="42px" icon={<TableIcon size={15} />}
                variant={view === 'table' ? 'solid' : 'ghost'}
                colorScheme={view === 'table' ? 'brand' : 'gray'}
                onClick={() => chooseView('table')} />
            </CkTooltip>
          </HStack>
        }>
        {error ? unavailable : loading ? (
          <SkeletonRegion><SkeletonRows count={4} progress /></SkeletonRegion>
        ) : byCategory.length === 0 ? (
          // On a first run the "Nothing logged yet" card above already offers
          // the next step, so no second button here.
          <CardEmptyState text={t('noExpenses')}
            action={!firstRun && (
              <Button as={RouterLink} to="/transactions/new" size="sm" variant="outline">{t('categories.add')}</Button>
            )} />
        ) : view === 'table' ? (
          <Table size="sm" variant="simple">
            <Thead>
              <Tr>
                <Th>{t('categories.category')}</Th>
                <Th isNumeric>{t('categories.amount')}</Th>
                <Th isNumeric>{t('categories.share')}</Th>
              </Tr>
            </Thead>
            <Tbody>
              {bars.map((c) => (
                <Tr key={c.name}>
                  <Td>
                    {c.to ? <Link as={RouterLink} to={c.to} aria-label={c.linkLabel}>{c.label}</Link> : c.label}
                  </Td>
                  <Td isNumeric fontWeight="600">{formatMoney(c.value, baseCurrency)}</Td>
                  <Td isNumeric color="text.muted">{c.share}%</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        ) : (
          // Ranked bars: one hue (identity is the label, not a colour), each row
          // labelled with its amount and share, so nothing depends on hover.
          <Stack spacing={4}>
          <Stack spacing={4} role="list" aria-label={t('categories.title')} id="spending-bars">
            {shownBars.rows.map((c, i) => (
              <ProgressRow key={c.name} role="listitem"
                title={c.label} meta={lines[i]}
                tooltip={t('categories.tooltip', { name: c.label, amount: formatMoney(c.value, baseCurrency), share: c.share })}
                media={<BucketIcon row={bucketRow.get(c.name)} />}
                percent={Math.max(c.ratio * 100, 2)} valueLabel={`${c.share}%`}
                to={c.to} linkLabel={c.linkLabel} />
            ))}
          </Stack>
          {(shownBars.hidden > 0 || showAllBars) && bars.length > TOP_CATEGORIES && (
            <Button size="sm" variant="outline" colorScheme="gray" w="full" aria-controls="spending-bars"
              aria-expanded={showAllBars} onClick={() => setShowAllBars((v) => !v)}
              rightIcon={showAllBars ? <ChevronUp size={16} /> : <ChevronDown size={16} />}>
              {showAllBars ? t('categories.showTop', { n: TOP_CATEGORIES }) : t('categories.showAll', { n: bars.length })}
            </Button>
          )}
          </Stack>
        )}
      </Panel>
    ),

    budgets: <BudgetsCard period={period} />,
    vouchers: <VoucherCard />,

    expenses: (
      <Panel icon={ReceiptText} title={expHead.title} subtitle={expHead.subtitle} divider>
        {error ? unavailable : loading ? (
          <SkeletonRegion><SkeletonRows count={5} py={2.5} /></SkeletonRegion>
        ) : expenses.length === 0 ? (
          <Text color="text.muted" fontSize="sm">{t('noExpenses')}</Text>
        ) : (
          <>
            <TransactionList rows={expPage.pageItems} kind="expense" baseCurrency={baseCurrency}
              mutate={mutate} reload={reload} />
            <Paginator page={expPage.page} count={expPage.count} onPage={expPage.setPage} />
          </>
        )}
      </Panel>
    ),

    income: (
      <Panel icon={Wallet} iconTone="positive" title={incHead.title} subtitle={incHead.subtitle} divider>
        {error ? unavailable : loading ? (
          <SkeletonRegion><SkeletonRows count={3} py={2.5} /></SkeletonRegion>
        ) : income.length === 0 ? (
          <Text color="text.muted" fontSize="sm">{t('noIncome')}</Text>
        ) : (
          <>
            <TransactionList rows={incPage.pageItems} kind="income" baseCurrency={baseCurrency}
              mutate={mutate} reload={reload} />
            <Paginator page={incPage.page} count={incPage.count} onPage={incPage.setPage} />
          </>
        )}
      </Panel>
    ),

    recurring: (
      <SubscriptionsCard rules={rules} fx={ruleFx} loading={rulesLoading} error={rulesError} onRetry={reloadRules}
        baseCurrency={baseCurrency} period={period} charges={{ rows, loading, error, onRetry: reload }} />
    ),
  }
  const show = (ids) => ids.map((id) => <Fragment key={id}>{card[id]}</Fragment>)
  const stacks = homeStacks({ firstRun })

  return (
    <Stack spacing={sideways ? 3 : 5}>
      <PageHeader title={t('title')} action={
        <Select data-tour="period" w={{ base: 'auto', sm: '200px' }} minW="140px" size="sm" borderRadius="lg" value={periodValue}
          aria-label={t('period')} onChange={(e) => setPeriodValue(e.target.value)}>
          {periods.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </Select>
      } />
      {sideways ? (
        <>
          {show(stacks.strip)}
          <Flex gap={3} align="start" sx={NARROW_STACKS}>
            <Stack spacing={3} flex="1" minW={0}>{show(stacks.left)}</Stack>
            <Stack spacing={3} flex="1" minW={0}>{show(stacks.right)}</Stack>
          </Flex>
        </>
      ) : show(homeCards({ firstRun }))}
    </Stack>
  )
}

// The overview's shape while the period's transactions load: Spent, then the
// Income and Net tiles (instead of €0.00 totals that look real), in the
// card's `grid`.
function OverviewSkeleton({ grid }) {
  return (
    <SkeletonRegion>
      <SimpleGrid {...grid} spacing={4} alignItems="center">
        <SkeletonFigure size="hero" w="60%" />
        <SimpleGrid columns={2} spacing={2}>
          <SkeletonBlock h="64px" radius="lg" />
          <SkeletonBlock h="64px" radius="lg" />
        </SimpleGrid>
      </SimpleGrid>
    </SkeletonRegion>
  )
}

// A category bar's icon: the category's own, or a people icon for a group's
// share bucket ("Other" and uncategorized fall back to the generic tag).
function BucketIcon({ row }) {
  if (row?.group_expense_id) return <IconTile icon={Users} />
  return <CategoryBadge category={row?.categories} size={32} />
}
