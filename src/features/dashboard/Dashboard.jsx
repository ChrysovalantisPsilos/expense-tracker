import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import {
  SimpleGrid, Box, Flex, Text, Stack, HStack, IconButton, Button,
  Table, Thead, Tbody, Tr, Th, Td, Tooltip as CkTooltip, Select, Link,
} from '@chakra-ui/react'
import { ChartBarDecreasing, ChevronDown, ChevronUp, PiggyBank, Table as TableIcon, ReceiptText, Users, Wallet } from 'lucide-react'
import TransactionList from '../transactions/TransactionList.jsx'
import FirstEntry from '../transactions/FirstEntry.jsx'
import { isFirstRun, listHeading } from '../transactions/listHeading.js'
import { useTransactions, oldestTransactionDate } from '../transactions/useData.js'
import { buildPeriods } from '../transactions/periods.js'
import { linkBuckets } from '../categories/categoryLinks.js'
import { useSavingsIds } from '../categories/categories.js'
import { today } from '../../shared/lib/dates.js'
import { useProfile } from '../../shared/lib/ProfileProvider.jsx'
import { useRecurring, useRuleRates } from '../recurring/recurring.js'
import { formatMoney } from '../../shared/lib/currency.js'
import { spendRows, paidInWindow } from '../../shared/lib/spread.js'
import { rulesInBase } from '../../shared/lib/ruleFx.js'
import { countedInWindow } from '../../shared/lib/salaryShift.js'
import { isSavingsRow } from '../../shared/lib/savings.js'
import { STORAGE_KEYS } from '../../shared/lib/keys.js'
import { usePaged } from '../../shared/ui/usePaged.js'
import Paginator from '../../shared/ui/Paginator.jsx'
import PageHeader from '../../shared/ui/PageHeader.jsx'
import CategoryBadge from '../../shared/ui/CategoryBadge.jsx'
import Panel from '../../shared/ui/kit/Panel.jsx'
import { CardEmptyState } from '../../shared/ui/EmptyState.jsx'
import Figure from '../../shared/ui/kit/Figure.jsx'
import IconTile from '../../shared/ui/kit/IconTile.jsx'
import { BalanceTile } from '../../shared/ui/kit/Balances.jsx'
import ProgressRow from '../../shared/ui/kit/ProgressRow.jsx'
import { signedAmount } from '../../shared/ui/kit/kitMath.js'
import { categoryBars } from './categoryBars.js'
import {
  periodTotals, periodProjection, projectedTotals, netNote, savedNote, visibleBars, TOP_CATEGORIES,
  homeCards, homeStacks,
} from './dashboardMath.js'
import BudgetsCard from '../budgets/BudgetsCard.jsx'
import SubscriptionsCard from '../recurring/SubscriptionsCard.jsx'
import QueryError from '../../shared/ui/QueryError.jsx'
import { useShortLandscape } from '../../shared/ui/useShortLandscape.js'
import { NARROW_STACKS } from '../../shared/ui/narrowStacks.js'
import { SkeletonBlock, SkeletonFigure, SkeletonRegion, SkeletonRows } from '../../shared/ui/Skeleton.jsx'

const VIEW_KEY = STORAGE_KEYS.overviewView

const UNAVAILABLE = 'Not available until your transactions load.'

export default function Dashboard() {
  const { baseCurrency, separateYearly, salaryShift } = useProfile()
  const { rules, loading: rulesLoading, error: rulesError, reload: reloadRules } = useRecurring()
  // Foreign rules count at today's ECB rate (the projection, the Recurring card).
  const ruleFx = useRuleRates(rules, baseCurrency)
  // undefined until known (null: no transactions at all)
  const [oldest, setOldest] = useState(undefined)
  const periods = useMemo(() => buildPeriods(oldest), [oldest])
  // Default to this month; its token is stable and always present in the list.
  const [periodValue, setPeriodValue] = useState(() => buildPeriods(null)[0].value)
  const period = periods.find((p) => p.value === periodValue) ?? periods[0]

  // `spread`: yearly subscriptions paid before the period still count their
  // share of it (totals only — the list shows what was paid in the period).
  const { rows, loading: rowsLoading, error, reload, mutate } = useTransactions({
    from: period.from ?? undefined, to: period.to ?? undefined, spread: true,
  })
  // Savings entries (0084) aren't income: every figure below waits for the
  // user's savings categories so none flashes with them counted.
  const { savingsIds, loading: savingsLoading } = useSavingsIds()
  const loading = rowsLoading || savingsLoading
  // Recheck whenever the (live) transaction rows change, so importing older
  // data extends the period dropdown without a reload. Cheap: 1-row query.
  useEffect(() => { oldestTransactionDate().then(setOldest) }, [rows])
  const [view, setView] = useState(() => localStorage.getItem(VIEW_KEY) || 'chart')
  function chooseView(v) { setView(v); localStorage.setItem(VIEW_KEY, v) }

  // Spread yearly charges count as their monthly parts in every total — or,
  // when the user keeps them separate, not at all (the Recurring card lists them).
  const spend = useMemo(
    () => spendRows(rows, baseCurrency, period.from, period.to, { separateYearly, salaryShift }),
    [rows, baseCurrency, period.from, period.to, separateYearly, salaryShift])
  const totals = useMemo(() => periodTotals(spend, baseCurrency, savingsIds), [spend, baseCurrency, savingsIds])
  const { byCategory, bucketRow } = totals
  const paid = useMemo(() => paidInWindow(rows, period.from, period.to), [rows, period.from, period.to])
  const expenses = useMemo(() => paid.filter((r) => r.kind !== 'income'), [paid])
  // Income is listed by the month it counts for: a late-month salary (the
  // salary setting) shows under the next month, with its real date. Savings
  // aren't income, so they're not listed here (the Transactions page has them).
  const income = useMemo(
    () => countedInWindow(rows.filter((r) => r.kind === 'income' && !isSavingsRow(r, savingsIds)),
      period.from, period.to, salaryShift),
    [rows, savingsIds, period.from, period.to, salaryShift])
  // Each bar drills down to its expenses for this period (a group share to its
  // group); the folded "Other" merges several buckets, so it has no link.
  // Every category, largest first (no fold: "Show all" reveals the tail).
  const bars = useMemo(
    () => linkBuckets(categoryBars(byCategory, Infinity), spend, period), [byCategory, spend, period])
  const [showAllBars, setShowAllBars] = useState(false)
  const shownBars = visibleBars(bars, showAllBars)

  // Fold not-yet-charged recurring into the period's spend/income projection,
  // but only for periods that are still ongoing (end today or later). Past
  // periods and "all time" stay purely actual.
  const todayISO = useMemo(() => today(), [])
  const proj = useMemo(
    () => periodProjection(rulesInBase(rules, baseCurrency, ruleFx.rates).rules, period.to, todayISO,
      separateYearly, salaryShift, savingsIds),
    [rules, baseCurrency, ruleFx.rates, period.to, todayISO, separateYearly, salaryShift, savingsIds])
  const { spentTotal, earnedTotal, fromIncomeTotal, fromSavingsTotal, netTotal } = projectedTotals(totals, proj)
  const net = signedAmount(netTotal, (m) => formatMoney(m, baseCurrency))
  const saved = savedNote(totals.saved, period, baseCurrency)

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

  // Every card by id; homeCards / homeStacks decide which show, and where.
  const card = {
    overview: error ? (
        // One error (with Retry) for the transactions every card below needs,
        // instead of €0.00 totals that look real.
        <Panel data-tour="overview"><QueryError error={error} onRetry={reload} what="your transactions" /></Panel>
      ) : (
      <Panel data-tour="overview">
        {loading ? <OverviewSkeleton grid={overviewGrid} /> : (
        <SimpleGrid {...overviewGrid} spacing={4} alignItems="center">
          <Box>
            <Figure label="Spent" size="hero" value={formatMoney(spentTotal, baseCurrency)} />
            {proj.expense > 0 && (
              <Text fontSize="xs" color="text.muted" mt={1}>
                incl. {formatMoney(proj.expense, baseCurrency)} upcoming
              </Text>
            )}
            {/* Expenses paid from savings (0085) are spending, but not
                against the Net. */}
            {fromSavingsTotal > 0 && (
              <Text fontSize="xs" color="text.muted" mt={proj.expense > 0 ? 0 : 1}>
                incl. {formatMoney(fromSavingsTotal, baseCurrency)} paid from savings
              </Text>
            )}
          </Box>
          <SimpleGrid columns={2} spacing={2}>
            <BalanceTile size="md" label="Income" value={formatMoney(earnedTotal, baseCurrency)} tone="positive"
              note={proj.income > 0 ? `incl. ${formatMoney(proj.income, baseCurrency)} upcoming` : undefined} />
            <BalanceTile size="md" label="Net" value={net.text} tone={net.tone}
              note={netNote(proj, fromIncomeTotal, fromSavingsTotal)} />
            {/* Savings aren't income (those taken from it lower the net): a quiet
                line says what was put aside, both kinds, and opens Savings. */}
            {saved && (
              <HStack as={RouterLink} to="/savings" gridColumn="span 2" justifySelf="start" spacing={1.5} px={1}
                color="text.muted" borderRadius="md" _hover={{ color: 'accent.fg' }}
                _focusVisible={{ boxShadow: 'outline' }}>
                <PiggyBank size={14} aria-hidden />
                <Text fontSize="xs">{saved} ›</Text>
              </HStack>
            )}
          </SimpleGrid>
        </SimpleGrid>
        )}
      </Panel>
      ),

    // Nothing logged at all yet: the way to start sits right under the
    // totals, in place of the (empty) Expenses card further down.
    firstEntry: <Panel><FirstEntry /></Panel>,

    categories: (
      <Panel data-tour="categories" icon={ChartBarDecreasing} title="Spending by category" action={
          <HStack spacing={1} bg="bg.subtle" p={1} borderRadius="lg">
            <CkTooltip label="Chart">
              <IconButton aria-label="Chart view" size="xs" icon={<ChartBarDecreasing size={15} />}
                variant={view !== 'table' ? 'solid' : 'ghost'}
                colorScheme={view !== 'table' ? 'brand' : 'gray'}
                onClick={() => chooseView('chart')} />
            </CkTooltip>
            <CkTooltip label="Table">
              <IconButton aria-label="Table view" size="xs" icon={<TableIcon size={15} />}
                variant={view === 'table' ? 'solid' : 'ghost'}
                colorScheme={view === 'table' ? 'brand' : 'gray'}
                onClick={() => chooseView('table')} />
            </CkTooltip>
          </HStack>
        }>
        {error ? <Text color="text.muted" fontSize="sm">{UNAVAILABLE}</Text> : loading ? (
          <SkeletonRegion><SkeletonRows count={4} progress /></SkeletonRegion>
        ) : byCategory.length === 0 ? (
          // On a first run the "Nothing logged yet" card above already offers
          // the next step, so no second button here.
          <CardEmptyState text="No expenses in this period."
            action={!firstRun && (
              <Button as={RouterLink} to="/transactions/new" size="sm" variant="outline">Add an expense</Button>
            )} />
        ) : view === 'table' ? (
          <Table size="sm" variant="simple">
            <Thead>
              <Tr>
                <Th>Category</Th>
                <Th isNumeric>Amount</Th>
                <Th isNumeric>Share</Th>
              </Tr>
            </Thead>
            <Tbody>
              {bars.map((c) => (
                <Tr key={c.name}>
                  <Td>
                    {c.to ? <Link as={RouterLink} to={c.to} aria-label={c.linkLabel}>{c.name}</Link> : c.name}
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
          <Stack spacing={4} role="list" aria-label="Spending by category" id="spending-bars">
            {shownBars.rows.map((c) => (
              <ProgressRow key={c.name} role="listitem"
                title={c.name} meta={formatMoney(c.value, baseCurrency)}
                tooltip={`${c.name}: ${formatMoney(c.value, baseCurrency)} (${c.share}%)`}
                media={<BucketIcon row={bucketRow.get(c.name)} />}
                percent={Math.max(c.ratio * 100, 2)} valueLabel={`${c.share}%`}
                to={c.to} linkLabel={c.linkLabel} />
            ))}
          </Stack>
          {(shownBars.hidden > 0 || showAllBars) && bars.length > TOP_CATEGORIES && (
            <Button size="sm" variant="outline" colorScheme="gray" w="full" aria-controls="spending-bars"
              aria-expanded={showAllBars} onClick={() => setShowAllBars((v) => !v)}
              rightIcon={showAllBars ? <ChevronUp size={16} /> : <ChevronDown size={16} />}>
              {showAllBars ? `Show top ${TOP_CATEGORIES}` : `Show all ${bars.length} categories`}
            </Button>
          )}
          </Stack>
        )}
      </Panel>
    ),

    budgets: <BudgetsCard period={period} />,

    expenses: (
      <Panel icon={ReceiptText} title={expHead.title} subtitle={expHead.subtitle} divider>
        {error ? <Text color="text.muted" fontSize="sm">{UNAVAILABLE}</Text> : loading ? (
          <SkeletonRegion><SkeletonRows count={5} py={2.5} /></SkeletonRegion>
        ) : expenses.length === 0 ? (
          <Text color="text.muted" fontSize="sm">No expenses in this period.</Text>
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
        {error ? <Text color="text.muted" fontSize="sm">{UNAVAILABLE}</Text> : loading ? (
          <SkeletonRegion><SkeletonRows count={3} py={2.5} /></SkeletonRegion>
        ) : income.length === 0 ? (
          <Text color="text.muted" fontSize="sm">No income in this period.</Text>
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
      <PageHeader title="Overview" action={
        <Select w={{ base: '140px', sm: '200px' }} size="sm" borderRadius="lg" value={periodValue}
          aria-label="Period" onChange={(e) => setPeriodValue(e.target.value)}>
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
