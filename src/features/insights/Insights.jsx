import { useEffect, useMemo, useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
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
import { StackedBar, ShareLegend } from '../../shared/ui/kit/ShareBar.jsx'
import { BalanceGrid, BalanceTile } from '../../shared/ui/kit/Balances.jsx'
import { signedAmount } from '../../shared/ui/kit/kitMath.js'
import { useChartTheme } from '../../shared/ui/useChartTheme.jsx'
import { SkeletonBlock, SkeletonRegion, SkeletonRows } from '../../shared/ui/Skeleton.jsx'
import { useTransactions, oldestTransactionDate } from '../transactions/useData.js'
import { linkBuckets } from '../categories/categoryLinks.js'
import { useSavingsIds } from '../categories/categories.js'
import { lastMonths } from '../../shared/lib/dates.js'
import { useProfile } from '../../shared/lib/ProfileProvider.jsx'
import { formatMoney, minorFactor } from '../../shared/lib/currency.js'
import { spendRows } from '../../shared/lib/spread.js'
import { useAccounts, deleteAccount } from './insights.js'
import { useSavingsMoves } from '../savings/savings.js'
import {
  buildTrend, hasTrendData, spendDelta, netWorth, accountSections, axisTick, spendingShares, foreignSpending,
} from './insightsMath.js'
import ReportsCard from './ReportsCard.jsx'
import QueryError from '../../shared/ui/QueryError.jsx'
import { userMessage } from '../../shared/lib/errors.js'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

// How many foreign-currency rows "Spending abroad" lists (the total covers all).
const ABROAD_ROWS = 5

export default function Insights() {
  const t = useT('insights')
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
  const failed = error ? <QueryError error={error} onRetry={reload} what={t('what')} /> : null
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
    { ...months[months.length - 1], label: t('thisMonth') },
  ), [spend, months, thisMonth, baseCurrency, t])
  // Spending abroad lists actual payments (each at its own rate), not shares.
  const abroad = useMemo(() => foreignSpending(rows, thisMonth, baseCurrency), [rows, thisMonth, baseCurrency])
  // Nothing ever logged (null; undefined while unknown): the statement export
  // has nothing to put in it.
  const [oldest, setOldest] = useState(undefined)
  useEffect(() => { oldestTransactionDate().then(setOldest) }, [rows])

  return (
    <Stack spacing={5}>
      <PageHeader title={t('title')} />
      <SpendingCard loading={loading} failed={failed} shares={shares} trend={trend} money={money} />
      {abroad.items.length > 0 && <AbroadCard abroad={abroad} baseCurrency={baseCurrency} />}
      <IncomeCard loading={loading} failed={failed} trend={trend} money={money} />
      <NetWorthCard baseCurrency={baseCurrency} />
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
  const t = useT('insights')
  const latest = trend[trend.length - 1]
  return (
    <Panel title={t('spending.title')} subtitle={t('thisMonth')}>
      {failed ? failed : loading ? <SpendingSkeleton /> : (
        <Stack spacing={5}>
          {shares.length === 0 ? (
            <Text color="text.muted" fontSize="sm">{t('spending.empty')}</Text>
          ) : (
            <Box>
              <StackedBar items={shares} />
              <ShareLegend items={shares} mt={3} />
            </Box>
          )}
          {hasTrendData(trend) && (
            <Box>
              <SectionLabel mb={3} aside={`${latest.label}: ${money(latest.expense)}`}>
                {t('lastMonths')}
              </SectionLabel>
              <TrendBars bars={trend.map((m) => ({ label: m.label, value: m.expense }))} />
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
  const t = useT('insights')
  const more = abroad.items.length - ABROAD_ROWS
  return (
    <Panel title={t('abroad.title')} subtitle={t('abroad.subtitle', { currency: baseCurrency })}>
      <Stack spacing={3}>
        {abroad.items.slice(0, ABROAD_ROWS).map((i) => (
          <ConversionRow key={i.id} label={i.label} rate={i.rate}
            from={formatMoney(i.minor, i.currency)} to={formatMoney(i.baseMinor, baseCurrency)} />
        ))}
        {more > 0 && (
          <Text fontSize="xs" color="text.muted">
            {t('abroad.more', { count: more })}
          </Text>
        )}
        <Divider borderColor="border.default" />
        <Figure layout="inline" label={t('total')} value={formatMoney(abroad.totalBaseMinor, baseCurrency)} />
      </Stack>
    </Panel>
  )
}

// ── Income vs expenses ──────────────────────────────────────────────────────
function IncomeCard({ loading, failed, trend, money }) {
  const t = useT('insights')
  const chart = useChartTheme()
  const delta = spendDelta(trend)
  const latest = trend[trend.length - 1]
  const net = signedAmount(latest.net, money) // income − expenses − savings taken from income
  return (
    <Panel title={t('income.title')} action={delta != null && <SpendDelta delta={delta} />}>
      {failed ? failed : loading ? <IncomeSkeleton /> : (
        <Stack spacing={5}>
          <Box>
            <SectionLabel mb={3}>{t('thisMonth')}</SectionLabel>
            <BalanceGrid>
              <BalanceTile label={t('income.income')} value={money(latest.income)} tone="positive" />
              <BalanceTile label={t('income.spent')} value={money(latest.expense)} />
            </BalanceGrid>
            <Figure layout="inline" label={t('income.leftOver')} value={net.text} tone={net.tone} mt={3} />
          </Box>
          {!hasTrendData(trend) ? (
            <Text color="text.muted" fontSize="sm">
              {t('income.empty')}
            </Text>
          ) : (
          <Box>
            <SectionLabel mb={3}>{t('lastMonths')}</SectionLabel>
            <Box h="220px">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trend} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chart.grid} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} tick={chart.tick} />
                  <YAxis tickLine={false} axisLine={false} fontSize={11} tick={chart.tick}
                    tickFormatter={axisTick} width={44} />
                  <Tooltip formatter={money} {...chart.tooltip} />
                  <Legend formatter={chart.legendFormatter} />
                  <Bar dataKey="income" name={t('income.income')} fill={chart.positive} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expense" name={t('income.expenses')} fill={chart.series[0]} radius={[4, 4, 0, 0]} />
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
  const t = useT('insights')
  const up = delta > 0
  const Arrow = up ? ArrowUpRight : ArrowDownRight
  return (
    <HStack spacing={1} fontSize="sm" fontWeight="700" color={up ? 'status.negative' : 'status.positive'}>
      <Arrow size={16} />
      <Text>{Math.abs(delta)}%</Text>
      <Text as="span" fontWeight="500" color="text.muted" display={{ base: 'none', sm: 'inline' }}>
        {t('income.vsLastMonth')}
      </Text>
    </HStack>
  )
}

// ── Net worth ───────────────────────────────────────────────────────────────
// The user's accounts, plus a read-only "Savings" line: the savings pot (every
// savings entry ever made, 0084, minus every expense paid from savings, 0085,
// in the base currency at each entry's captured rate), which links to the
// Savings page. It can go below zero (shown with a minus, as a debt); it's
// hidden only when it's exactly zero.
function NetWorthCard({ baseCurrency }) {
  const { accounts, loading: accountsLoading, error, reload } = useAccounts()
  const { pot: savings, loading: savingsLoading } = useSavingsMoves()
  const toast = useToast()
  const navigate = useNavigate()
  const t = useT('insights')

  const { assets, liabilities, net, showPot } = useMemo(() => netWorth(accounts, savings), [accounts, savings])
  const sections = useMemo(() => accountSections(accounts), [accounts])
  const accountRow = (acc) => <AccountRow key={acc.id} account={acc} remove={remove} />
  const seeSavings = (
    <Text as="span" color="accent.fg" fontWeight="600" whiteSpace="nowrap">{t('netWorth.seeSavings')}</Text>
  )
  const loading = accountsLoading || savingsLoading

  async function remove(acc) {
    try { await deleteAccount(acc.id); reload() }
    catch (e) {
      console.error('[insights] account delete failed:', e)
      toast({ title: userMessage(e, t('netWorth.removeFailed')), status: 'error' })
    }
  }

  return (
    <Panel title={t('netWorth.title')} action={
      <Button size="xs" leftIcon={<Plus size={14} />}
        onClick={() => navigate('/insights/accounts/new')}>{t('netWorth.add')}</Button>
    }>
      {error ? <QueryError error={error} onRetry={reload} what={t('netWorth.what')} /> : loading ? <NetWorthSkeleton /> : (
        <Stack spacing={4}>
          <BalanceGrid>
            <BalanceTile label={t('netWorth.assets')} value={formatMoney(assets, baseCurrency)} tone="positive" />
            <BalanceTile label={t('netWorth.debts')} value={formatMoney(liabilities, baseCurrency)}
              tone={liabilities > 0 ? 'negative' : 'muted'} />
          </BalanceGrid>

          {accounts.length === 0 && savings === 0 ? (
            <Text color="text.muted" fontSize="sm">
              {t('netWorth.empty')}
            </Text>
          ) : (
            <Stack spacing={3}>
              {sections.savings.length > 0 && (
                // Savings accounts are the savings (0092): listed under "Savings",
                // with the link to the Savings page, instead of the pot line.
                <Box>
                  <HStack justify="space-between" mb={1}>
                    <SectionLabel>{t('netWorth.savings')}</SectionLabel>
                    <Text as={RouterLink} to="/savings" fontSize="xs">{seeSavings}</Text>
                  </HStack>
                  {sections.savings.map(accountRow)}
                </Box>
              )}
              {(showPot || sections.other.length > 0) && (
                <Box>
                  <SectionLabel mb={1}>{t('netWorth.accounts')}</SectionLabel>
                  {showPot && (
                    <ItemRow icon={PiggyBank} title={t('netWorth.savings')} onClick={() => navigate('/savings')}
                      meta={
                        <Text fontSize="xs" color="text.muted" overflowWrap="anywhere">
                          {savings < 0 && t('netWorth.overdrawn')}
                          {seeSavings}
                        </Text>
                      }
                      amount={`${savings < 0 ? '−' : ''}${formatMoney(Math.abs(savings), baseCurrency)}`}
                      amountTone={savings < 0 ? 'negative' : 'default'}
                      // No actions of its own; the empty slot lines its amount up with the accounts'.
                      actions={[]} actionSlots={2} />
                  )}
                  {sections.other.map(accountRow)}
                </Box>
              )}
            </Stack>
          )}

          <Divider borderColor="border.default" />
          <Figure layout="inline" label={t('netWorth.title')} value={formatMoney(net, baseCurrency)}
            tone={net < 0 ? 'negative' : 'default'} />
        </Stack>
      )}
    </Panel>
  )
}

// One net-worth account: a debt (minus, red), a savings account or an asset,
// with Edit and Delete.
function AccountRow({ account: acc, remove }) {
  const navigate = useNavigate()
  const t = useT('insights')
  const debt = acc.type === 'liability'
  const saving = acc.type === 'savings'
  return (
    <ItemRow icon={debt ? CreditCard : saving ? PiggyBank : Landmark} title={acc.name}
      meta={saving ? 'Savings account' : t(debt ? 'netWorth.debt' : 'netWorth.asset')}
      amount={`${debt ? '−' : ''}${formatMoney(acc.balance_minor, acc.currency)}`}
      amountTone={debt ? 'negative' : 'default'}
      actions={[
        { label: t('actions.edit'), icon: Pencil, onClick: () => navigate(`/insights/accounts/${acc.id}`, { state: { account: acc } }) },
        { label: t('actions.delete'), icon: Trash2, onClick: () => remove(acc), danger: true },
      ]} />
  )
}
