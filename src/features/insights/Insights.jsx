import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Stack, HStack, Text, Button, Box, Divider, SimpleGrid, useToast,
} from '@chakra-ui/react'
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend, CartesianGrid,
} from 'recharts'
import {
  Plus, Pencil, Trash2, PiggyBank, Landmark, CreditCard, ArrowUpRight, ArrowDownRight,
} from 'lucide-react'
import PageHeader from '../../shared/ui/PageHeader.jsx'
import Panel from '../../shared/ui/kit/Panel.jsx'
import SectionLabel from '../../shared/ui/kit/SectionLabel.jsx'
import TrendBars from '../../shared/ui/kit/TrendBars.jsx'
import ConversionRow from '../../shared/ui/kit/ConversionRow.jsx'
import Figure from '../../shared/ui/kit/Figure.jsx'
import ItemRow from '../../shared/ui/kit/ItemRow.jsx'
import ProgressRow from '../../shared/ui/kit/ProgressRow.jsx'
import { StackedBar, ShareLegend } from '../../shared/ui/kit/ShareBar.jsx'
import { BalanceGrid, BalanceTile } from '../../shared/ui/kit/Balances.jsx'
import { signedAmount } from '../../shared/ui/kit/kitMath.js'
import { useChartTheme } from '../../shared/ui/useChartTheme.jsx'
import { SkeletonBlock, SkeletonRegion, SkeletonRows } from '../../shared/ui/Skeleton.jsx'
import { useTransactions, oldestTransactionDate } from '../transactions/useData.js'
import { linkBuckets } from '../categories/categoryLinks.js'
import { useSavingsIds } from '../categories/categories.js'
import { lastMonths, shortDate } from '../../shared/lib/dates.js'
import { useProfile } from '../../shared/lib/ProfileProvider.jsx'
import { formatMoney, minorFactor } from '../../shared/lib/currency.js'
import { spendRows } from '../../shared/lib/spread.js'
import { savedMinor } from '../../shared/lib/savings.js'
import {
  useAccounts, deleteAccount,
  useGoals, saveGoal, deleteGoal,
} from './insights.js'
import {
  buildTrend, hasTrendData, spendDelta, netWorth, axisTick, spendingShares, foreignSpending,
  goalProgress, goalSavedAfter,
} from './insightsMath.js'
import ReportsCard from './ReportsCard.jsx'
import QueryError from '../../shared/ui/QueryError.jsx'
import { userMessage } from '../../shared/lib/errors.js'

// How many foreign-currency rows "Spending abroad" lists (the total covers all).
const ABROAD_ROWS = 5

export default function Insights() {
  const { baseCurrency = 'EUR', separateYearly, salaryShift } = useProfile()
  const months = useMemo(() => lastMonths(6), [])
  const from = months[0].from
  const to = months[months.length - 1].to
  // `spread`: a yearly subscription counts its monthly share in every month it
  // covers, including one paid before the six months (spendRows) — or not at
  // all when the user keeps yearly subscriptions separate.
  const { rows, loading: rowsLoading, error, reload } = useTransactions({ from, to, spread: true })
  // Savings entries (0084) are neither income nor spending: the trend leaves
  // them out, and waits for the savings categories so it never counts them.
  const { savingsIds, loading: savingsLoading } = useSavingsIds()
  const loading = rowsLoading || savingsLoading
  const spend = useMemo(
    () => spendRows(rows, baseCurrency, from, to, { separateYearly, salaryShift }),
    [rows, baseCurrency, from, to, separateYearly, salaryShift])
  const failed = error ? <QueryError error={error} onRetry={reload} what="your transactions" /> : null
  const thisMonth = months[months.length - 1].key

  // Trend values are major units (chart axis); `money` converts back to minor.
  const factor = minorFactor(baseCurrency)
  const money = (major) => formatMoney(Math.round(major * factor), baseCurrency)
  const trend = useMemo(
    () => buildTrend(spend, months, baseCurrency, savingsIds), [spend, months, baseCurrency, savingsIds])
  // Each legend entry drills down to this month's expenses in it (a group share
  // to its group); the folded "Other" merges several buckets, so it has no link.
  const shares = useMemo(() => linkBuckets(
    spendingShares(spend, thisMonth, baseCurrency), spend,
    { ...months[months.length - 1], label: 'This month' }, (s) => s.label,
  ), [spend, months, thisMonth, baseCurrency])
  // Spending abroad lists actual payments (each at its own rate), not shares.
  const abroad = useMemo(() => foreignSpending(rows, thisMonth, baseCurrency), [rows, thisMonth, baseCurrency])
  // Nothing ever logged (null; undefined while unknown): the statement export
  // has nothing to put in it.
  const [oldest, setOldest] = useState(undefined)
  useEffect(() => { oldestTransactionDate().then(setOldest) }, [rows])

  return (
    <Stack spacing={5}>
      <PageHeader title="Insights" />
      <SpendingCard loading={loading} failed={failed} shares={shares} trend={trend} money={money} />
      {abroad.items.length > 0 && <AbroadCard abroad={abroad} baseCurrency={baseCurrency} />}
      <IncomeCard loading={loading} failed={failed} trend={trend} money={money} />
      <NetWorthCard baseCurrency={baseCurrency} savingsIds={savingsIds} savingsLoading={savingsLoading} />
      <GoalsCard />
      <ReportsCard noEntries={oldest === null} />
    </Stack>
  )
}

// ── Skeletons, shaped like each card ────────────────────────────────────────
const TREND = ['55%', '70%', '62%', '85%', '74%', '66%']
const TileSkeletons = () => (
  <SimpleGrid columns={2} spacing={2}>
    <SkeletonBlock h="52px" radius="lg" />
    <SkeletonBlock h="52px" radius="lg" />
  </SimpleGrid>
)

function SpendingSkeleton() {
  return (
    <SkeletonRegion>
      <Stack spacing={5}>
        <Box>
          <SkeletonBlock h="12px" />
          <SimpleGrid columns={2} spacingX={4} spacingY={2.5} mt={3}>
            {['70%', '55%', '62%', '48%'].map((w) => <SkeletonBlock key={w} w={w} h="10px" />)}
          </SimpleGrid>
        </Box>
        <Box>
          <SkeletonBlock w="30%" h="10px" mb={3} />
          <HStack h="110px" align="end" spacing={2}>
            {TREND.map((h, i) => <SkeletonBlock key={i} flex="1" h={h} radius="md" />)}
          </HStack>
        </Box>
      </Stack>
    </SkeletonRegion>
  )
}

function IncomeSkeleton() {
  return (
    <SkeletonRegion>
      <Stack spacing={5}>
        <Box>
          <SkeletonBlock w="25%" h="10px" mb={3} />
          <TileSkeletons />
          <HStack justify="space-between" mt={3}>
            <SkeletonBlock w="80px" h="12px" />
            <SkeletonBlock w="90px" h="16px" />
          </HStack>
        </Box>
        <Box>
          <SkeletonBlock w="30%" h="10px" mb={3} />
          <SkeletonBlock h="220px" radius="lg" />
        </Box>
      </Stack>
    </SkeletonRegion>
  )
}

function NetWorthSkeleton() {
  return (
    <SkeletonRegion>
      <Stack spacing={4}>
        <TileSkeletons />
        <SkeletonRows count={2} />
      </Stack>
    </SkeletonRegion>
  )
}

// ── Where your money went ───────────────────────────────────────────────────
// This month's spending split by category, then six months of spending.
function SpendingCard({ loading, failed, shares, trend, money }) {
  const latest = trend[trend.length - 1]
  return (
    <Panel title="Where your money went" subtitle="This month">
      {failed ? failed : loading ? <SpendingSkeleton /> : (
        <Stack spacing={5}>
          {shares.length === 0 ? (
            <Text color="text.muted" fontSize="sm">No spending yet this month.</Text>
          ) : (
            <Box>
              <StackedBar items={shares} />
              <ShareLegend items={shares} mt={3} />
            </Box>
          )}
          {hasTrendData(trend) && (
            <Box>
              <SectionLabel mb={3} aside={`${latest.label}: ${money(latest.expense)}`}>
                Last 6 months
              </SectionLabel>
              <TrendBars bars={trend.map((t) => ({ label: t.label, value: t.expense }))} />
            </Box>
          )}
        </Stack>
      )}
    </Panel>
  )
}

// ── Spending abroad ─────────────────────────────────────────────────────────
// This month's foreign-currency expenses at the rate captured when each was
// added, and what they came to in the base currency.
function AbroadCard({ abroad, baseCurrency }) {
  const more = abroad.items.length - ABROAD_ROWS
  return (
    <Panel title="Spending abroad" subtitle={`This month, in ${baseCurrency}`}>
      <Stack spacing={3}>
        {abroad.items.slice(0, ABROAD_ROWS).map((i) => (
          <ConversionRow key={i.id} label={i.label} rate={i.rate}
            from={formatMoney(i.minor, i.currency)} to={formatMoney(i.baseMinor, baseCurrency)} />
        ))}
        {more > 0 && (
          <Text fontSize="xs" color="text.muted">
            and {more} more, included in the total
          </Text>
        )}
        <Divider borderColor="border.default" />
        <Figure layout="inline" label="Total" value={formatMoney(abroad.totalBaseMinor, baseCurrency)} />
      </Stack>
    </Panel>
  )
}

// ── Income vs expenses ──────────────────────────────────────────────────────
function IncomeCard({ loading, failed, trend, money }) {
  const chart = useChartTheme()
  const delta = spendDelta(trend)
  const latest = trend[trend.length - 1]
  const net = signedAmount(latest.net, money) // income − expenses − savings taken from income
  return (
    <Panel title="Income vs expenses" action={delta != null && <SpendDelta delta={delta} />}>
      {failed ? failed : loading ? <IncomeSkeleton /> : (
        <Stack spacing={5}>
          <Box>
            <SectionLabel mb={3}>This month</SectionLabel>
            <BalanceGrid>
              <BalanceTile label="Income" value={money(latest.income)} tone="positive" />
              <BalanceTile label="Spent" value={money(latest.expense)} />
            </BalanceGrid>
            <Figure layout="inline" label="Left over" value={net.text} tone={net.tone} mt={3} />
          </Box>
          {!hasTrendData(trend) ? (
            <Text color="text.muted" fontSize="sm">
              Nothing to compare yet. Your income and spending of the last six months show here.
            </Text>
          ) : (
          <Box>
            <SectionLabel mb={3}>Last 6 months</SectionLabel>
            <Box h="220px">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trend} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chart.grid} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} tick={chart.tick} />
                  <YAxis tickLine={false} axisLine={false} fontSize={11} tick={chart.tick}
                    tickFormatter={axisTick} width={44} />
                  <Tooltip formatter={money} {...chart.tooltip} />
                  <Legend formatter={chart.legendFormatter} />
                  <Bar dataKey="income" name="Income" fill={chart.positive} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expense" name="Expenses" fill={chart.series[0]} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Box>
          </Box>
          )}
        </Stack>
      )}
    </Panel>
  )
}

// Spending change vs last month. Up is the bad direction for spending, so it
// takes the negative tone; the comparison words drop on phones.
function SpendDelta({ delta }) {
  const up = delta > 0
  const Arrow = up ? ArrowUpRight : ArrowDownRight
  return (
    <HStack spacing={1} fontSize="sm" fontWeight="700" color={up ? 'status.negative' : 'status.positive'}>
      <Arrow size={16} />
      <Text>{Math.abs(delta)}%</Text>
      <Text as="span" fontWeight="500" color="text.muted" display={{ base: 'none', sm: 'inline' }}>
        vs last month
      </Text>
    </HStack>
  )
}

// ── Net worth ───────────────────────────────────────────────────────────────
// The user's accounts, plus a read-only "Savings" asset: every savings entry
// ever made (0084), in the base currency at each entry's captured rate.
function NetWorthCard({ baseCurrency, savingsIds, savingsLoading }) {
  const { accounts, loading: accountsLoading, error, reload } = useAccounts()
  const income = useTransactions({ kind: 'income' })
  const toast = useToast()
  const navigate = useNavigate()

  const savings = useMemo(
    () => savedMinor(income.rows, savingsIds, baseCurrency), [income.rows, savingsIds, baseCurrency])
  const { assets, liabilities, net } = useMemo(() => netWorth(accounts, savings), [accounts, savings])
  const loading = accountsLoading || savingsLoading || income.loading

  async function remove(acc) {
    try { await deleteAccount(acc.id); reload() }
    catch (e) {
      console.error('[insights] account delete failed:', e)
      toast({ title: userMessage(e, 'Couldn’t remove it from your net worth. Please try again.'), status: 'error' })
    }
  }

  return (
    <Panel title="Net worth" action={
      <Button size="xs" leftIcon={<Plus size={14} />}
        onClick={() => navigate('/insights/accounts/new')}>Account</Button>
    }>
      {error ? <QueryError error={error} onRetry={reload} what="your accounts" /> : loading ? <NetWorthSkeleton /> : (
        <Stack spacing={4}>
          <BalanceGrid>
            <BalanceTile label="Assets" value={formatMoney(assets, baseCurrency)} tone="positive" />
            <BalanceTile label="Debts" value={formatMoney(liabilities, baseCurrency)}
              tone={liabilities > 0 ? 'negative' : 'muted'} />
          </BalanceGrid>

          {accounts.length === 0 && savings === 0 ? (
            <Text color="text.muted" fontSize="sm">
              Add your account balances (bank, savings, card, loan) to track net worth.
            </Text>
          ) : (
            <Box>
              <SectionLabel mb={1}>Accounts</SectionLabel>
              {savings !== 0 && (
                <ItemRow icon={PiggyBank} title="Savings" meta="From your savings entries"
                  amount={formatMoney(savings, baseCurrency)} />
              )}
              {accounts.map((acc) => {
                const debt = acc.type === 'liability'
                return (
                  <ItemRow key={acc.id} icon={debt ? CreditCard : Landmark} title={acc.name}
                    meta={debt ? 'Debt' : 'Asset'}
                    amount={`${debt ? '−' : ''}${formatMoney(acc.balance_minor, acc.currency)}`}
                    amountTone={debt ? 'negative' : 'default'}
                    actions={[
                      { label: 'Edit', icon: Pencil, onClick: () => navigate(`/insights/accounts/${acc.id}`, { state: { account: acc } }) },
                      { label: 'Delete', icon: Trash2, onClick: () => remove(acc), danger: true },
                    ]} />
                )
              })}
            </Box>
          )}

          <Divider borderColor="border.default" />
          <Figure layout="inline" label="Net worth" value={formatMoney(net, baseCurrency)}
            tone={net < 0 ? 'negative' : 'default'} />
        </Stack>
      )}
    </Panel>
  )
}

// ── Goals ───────────────────────────────────────────────────────────────────
function GoalsCard() {
  const { goals, loading, error, reload } = useGoals()
  const toast = useToast()
  const navigate = useNavigate()

  async function remove(g) {
    try { await deleteGoal(g.id); reload() }
    catch (e) {
      console.error('[insights] goal delete failed:', e)
      toast({ title: userMessage(e, 'Couldn’t delete the goal. Please try again.'), status: 'error' })
    }
  }
  async function addTo(g, deltaMinor) {
    try {
      // Send the full goal — the encrypting save RPC rewrites every field.
      await saveGoal({ ...g, saved_minor: goalSavedAfter(g, deltaMinor) })
      reload()
    } catch (e) {
      console.error('[insights] goal update failed:', e)
      toast({ title: userMessage(e, 'Couldn’t update the goal. Please try again.'), status: 'error' })
    }
  }

  return (
    <Panel title="Savings goals" action={
      <Button size="xs" leftIcon={<Plus size={14} />}
        onClick={() => navigate('/insights/goals/new')}>Goal</Button>
    }>
      {error ? <QueryError error={error} onRetry={reload} what="your goals" /> : loading ? (
        <SkeletonRegion><SkeletonRows count={2} progress spacing={5} /></SkeletonRegion>
      ) : goals.length === 0 ? (
        <Text color="text.muted" fontSize="sm">No goals yet — set one to start saving toward it.</Text>
      ) : (
        <Stack spacing={5}>
          {goals.map((g) => {
            const { pct, done, step } = goalProgress(g)
            const by = g.target_date ? ` · by ${shortDate(g.target_date)}` : ''
            return (
              <Box key={g.id}>
                <ProgressRow icon={PiggyBank} title={g.name}
                  meta={`${formatMoney(g.saved_minor, g.currency)} of ${formatMoney(g.target_minor, g.currency)}${by}`}
                  percent={pct} over={false} tone={done ? 'positive' : undefined}
                  valueLabel={done ? 'Reached 🎉' : `${pct}%`}
                  actions={[
                    { label: 'Edit', icon: Pencil, onClick: () => navigate(`/insights/goals/${g.id}`, { state: { goal: g } }) },
                    { label: 'Delete', icon: Trash2, onClick: () => remove(g), danger: true },
                  ]} />
                {!done && (
                  <HStack mt={3} spacing={2}>
                    <Button size="xs" variant="outline" onClick={() => addTo(g, step)}>
                      + {formatMoney(step, g.currency)}
                    </Button>
                    {g.saved_minor > 0 && (
                      <Button size="xs" variant="ghost" onClick={() => addTo(g, -step)}>− {formatMoney(step, g.currency)}</Button>
                    )}
                  </HStack>
                )}
              </Box>
            )
          })}
        </Stack>
      )}
    </Panel>
  )
}
