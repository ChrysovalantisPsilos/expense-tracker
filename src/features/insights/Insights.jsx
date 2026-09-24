import { useMemo, useState } from 'react'
import {
  Stack, HStack, Text, Button, Center, Spinner, Box, Divider, Select, Input,
  FormControl, FormLabel, useToast, useDisclosure,
} from '@chakra-ui/react'
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend, CartesianGrid,
} from 'recharts'
import {
  Plus, Pencil, Trash2, PiggyBank, Landmark, CreditCard, ArrowUpRight, ArrowDownRight,
} from 'lucide-react'
import OptionalDate from '../../shared/ui/OptionalDate.jsx'
import MoneyInput from '../../shared/ui/MoneyInput.jsx'
import FormModal from '../../shared/ui/FormModal.jsx'
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
import { useTransactions } from '../transactions/useData.js'
import { linkBuckets } from '../categories/categoryLinks.js'
import { lastMonths, shortDate } from '../../shared/lib/dates.js'
import { useAsyncSubmit } from '../../shared/lib/useAsyncSubmit.js'
import { useProfile } from '../../shared/lib/ProfileProvider.jsx'
import { formatMoney, toMinor, fromMinor, minorFactor } from '../../shared/lib/currency.js'
import { spendRows } from '../../shared/lib/spread.js'
import {
  useAccounts, saveAccount, deleteAccount,
  useGoals, saveGoal, deleteGoal,
} from './insights.js'
import {
  buildTrend, spendDelta, netWorth, axisTick, spendingShares, foreignSpending,
  goalProgress, goalSavedAfter,
} from './insightsMath.js'
import ReportsCard from './ReportsCard.jsx'
import QueryError from '../../shared/ui/QueryError.jsx'
import { userMessage } from '../../shared/lib/errors.js'

// How many foreign-currency rows "Spending abroad" lists (the total covers all).
const ABROAD_ROWS = 5

export default function Insights() {
  const { baseCurrency = 'EUR', separateYearly } = useProfile()
  const months = useMemo(() => lastMonths(6), [])
  const from = months[0].from
  const to = months[months.length - 1].to
  // `spread`: a yearly subscription counts its monthly share in every month it
  // covers, including one paid before the six months (spendRows) — or not at
  // all when the user keeps yearly subscriptions separate.
  const { rows, loading, error, reload } = useTransactions({ from, to, spread: true })
  const spend = useMemo(
    () => spendRows(rows, baseCurrency, from, to, { separateYearly }),
    [rows, baseCurrency, from, to, separateYearly])
  const failed = error ? <QueryError error={error} onRetry={reload} what="your transactions" /> : null
  const thisMonth = months[months.length - 1].key

  // Trend values are major units (chart axis); `money` converts back to minor.
  const factor = minorFactor(baseCurrency)
  const money = (major) => formatMoney(Math.round(major * factor), baseCurrency)
  const trend = useMemo(() => buildTrend(spend, months, baseCurrency), [spend, months, baseCurrency])
  // Each legend entry drills down to this month's expenses in it (a group share
  // to its group); the folded "Other" merges several buckets, so it has no link.
  const shares = useMemo(() => linkBuckets(
    spendingShares(spend, thisMonth, baseCurrency), spend,
    { ...months[months.length - 1], label: 'This month' }, (s) => s.label,
  ), [spend, months, thisMonth, baseCurrency])
  // Spending abroad lists actual payments (each at its own rate), not shares.
  const abroad = useMemo(() => foreignSpending(rows, thisMonth, baseCurrency), [rows, thisMonth, baseCurrency])

  return (
    <Stack spacing={5}>
      <PageHeader title="Insights" />
      <SpendingCard loading={loading} failed={failed} shares={shares} trend={trend} money={money} />
      {abroad.items.length > 0 && <AbroadCard abroad={abroad} baseCurrency={baseCurrency} />}
      <IncomeCard loading={loading} failed={failed} trend={trend} money={money} />
      <NetWorthCard baseCurrency={baseCurrency} />
      <GoalsCard baseCurrency={baseCurrency} />
      <ReportsCard />
    </Stack>
  )
}

const Loading = () => <Center py={10}><Spinner color="brand.500" /></Center>

// ── Where your money went ───────────────────────────────────────────────────
// This month's spending split by category, then six months of spending.
function SpendingCard({ loading, failed, shares, trend, money }) {
  const latest = trend[trend.length - 1]
  return (
    <Panel title="Where your money went" subtitle="This month">
      {failed ? failed : loading ? <Loading /> : (
        <Stack spacing={5}>
          {shares.length === 0 ? (
            <Text color="text.muted" fontSize="sm">No spending yet this month.</Text>
          ) : (
            <Box>
              <StackedBar items={shares} />
              <ShareLegend items={shares} mt={3} />
            </Box>
          )}
          <Box>
            <SectionLabel mb={3} aside={`${latest.label}: ${money(latest.expense)}`}>
              Last 6 months
            </SectionLabel>
            <TrendBars bars={trend.map((t) => ({ label: t.label, value: t.expense }))} />
          </Box>
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
  const net = signedAmount(latest.income - latest.expense, money)
  return (
    <Panel title="Income vs expenses" action={delta != null && <SpendDelta delta={delta} />}>
      {failed ? failed : loading ? <Loading /> : (
        <Stack spacing={5}>
          <Box>
            <SectionLabel mb={3}>This month</SectionLabel>
            <BalanceGrid>
              <BalanceTile label="Income" value={money(latest.income)} tone="positive" />
              <BalanceTile label="Spent" value={money(latest.expense)} />
            </BalanceGrid>
            <Figure layout="inline" label="Left over" value={net.text} tone={net.tone} mt={3} />
          </Box>
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
function NetWorthCard({ baseCurrency }) {
  const { accounts, loading, error, reload } = useAccounts()
  const toast = useToast()
  const modal = useDisclosure()
  const [editing, setEditing] = useState(null)

  const { assets, liabilities, net } = useMemo(() => netWorth(accounts), [accounts])

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
        onClick={() => { setEditing(null); modal.onOpen() }}>Account</Button>
    }>
      {error ? <QueryError error={error} onRetry={reload} what="your accounts" /> : loading ? <Loading /> : (
        <Stack spacing={4}>
          <BalanceGrid>
            <BalanceTile label="Assets" value={formatMoney(assets, baseCurrency)} tone="positive" />
            <BalanceTile label="Debts" value={formatMoney(liabilities, baseCurrency)}
              tone={liabilities > 0 ? 'negative' : 'muted'} />
          </BalanceGrid>

          {accounts.length === 0 ? (
            <Text color="text.muted" fontSize="sm">
              Add your account balances (bank, savings, card, loan) to track net worth.
            </Text>
          ) : (
            <Box>
              <SectionLabel mb={1}>Accounts</SectionLabel>
              {accounts.map((acc) => {
                const debt = acc.type === 'liability'
                return (
                  <ItemRow key={acc.id} icon={debt ? CreditCard : Landmark} title={acc.name}
                    meta={debt ? 'Debt' : 'Asset'}
                    amount={`${debt ? '−' : ''}${formatMoney(acc.balance_minor, acc.currency)}`}
                    amountTone={debt ? 'negative' : 'default'}
                    actions={[
                      { label: 'Edit', icon: Pencil, onClick: () => { setEditing(acc); modal.onOpen() } },
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

      {modal.isOpen && (
        <AccountModal account={editing} baseCurrency={baseCurrency}
          onClose={modal.onClose} onSaved={() => { modal.onClose(); reload() }} />
      )}
    </Panel>
  )
}

function AccountModal({ account, baseCurrency, onClose, onSaved }) {
  const toast = useToast()
  const isEdit = !!account
  const [name, setName] = useState(account?.name ?? '')
  const [type, setType] = useState(account?.type ?? 'asset')
  const [balance, setBalance] = useState(account ? String(fromMinor(account.balance_minor, account.currency)) : '')
  const [currency] = useState(account?.currency ?? baseCurrency)
  const { busy, run } = useAsyncSubmit()

  async function submit() {
    if (!name.trim()) return toast({ title: 'Name it', status: 'warning' })
    await run(async () => {
      await saveAccount({
        id: account?.id, name: name.trim(), type,
        balance_minor: toMinor(Number(balance) || 0, currency), currency,
      })
      onSaved()
    })
  }

  return (
    <FormModal isOpen onClose={onClose} title={isEdit ? 'Edit account' : 'Add account'}
      onSubmit={submit} busy={busy} submitLabel={isEdit ? 'Save' : 'Add'}>
      <Stack spacing={4}>
        <FormControl isRequired>
          <FormLabel>Name</FormLabel>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Checking, Visa, Savings…" />
        </FormControl>
        <FormControl>
          <FormLabel>Type</FormLabel>
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="asset">Asset (what you own)</option>
            <option value="liability">Debt (what you owe)</option>
          </Select>
        </FormControl>
        <FormControl isRequired>
          <FormLabel>Balance ({currency})</FormLabel>
          <MoneyInput allowNegative value={balance} onChange={setBalance} placeholder="0" />
        </FormControl>
      </Stack>
    </FormModal>
  )
}

// ── Goals ───────────────────────────────────────────────────────────────────
function GoalsCard({ baseCurrency }) {
  const { goals, loading, error, reload } = useGoals()
  const toast = useToast()
  const modal = useDisclosure()
  const [editing, setEditing] = useState(null)

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
        onClick={() => { setEditing(null); modal.onOpen() }}>Goal</Button>
    }>
      {error ? <QueryError error={error} onRetry={reload} what="your goals" /> : loading ? <Loading /> : goals.length === 0 ? (
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
                    { label: 'Edit', icon: Pencil, onClick: () => { setEditing(g); modal.onOpen() } },
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

      {modal.isOpen && (
        <GoalModal goal={editing} baseCurrency={baseCurrency}
          onClose={modal.onClose} onSaved={() => { modal.onClose(); reload() }} />
      )}
    </Panel>
  )
}

function GoalModal({ goal, baseCurrency, onClose, onSaved }) {
  const toast = useToast()
  const isEdit = !!goal
  const [name, setName] = useState(goal?.name ?? '')
  const [target, setTarget] = useState(goal ? String(fromMinor(goal.target_minor, goal.currency)) : '')
  const [saved, setSaved] = useState(goal ? String(fromMinor(goal.saved_minor, goal.currency)) : '0')
  const [currency] = useState(goal?.currency ?? baseCurrency)
  const [targetDate, setTargetDate] = useState(goal?.target_date ?? '')
  const { busy, run } = useAsyncSubmit()

  async function submit() {
    if (!name.trim()) return toast({ title: 'Name it', status: 'warning' })
    if (!target || Number(target) <= 0) return toast({ title: 'Set a target', status: 'warning' })
    await run(async () => {
      await saveGoal({
        id: goal?.id, name: name.trim(),
        target_minor: toMinor(target, currency), saved_minor: toMinor(saved || '0', currency),
        currency, target_date: targetDate || null,
      })
      onSaved()
    })
  }

  return (
    <FormModal isOpen onClose={onClose} title={isEdit ? 'Edit goal' : 'New goal'}
      onSubmit={submit} busy={busy} submitLabel={isEdit ? 'Save' : 'Add'}>
      <Stack spacing={4}>
        <FormControl isRequired>
          <FormLabel>Name</FormLabel>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Emergency fund, holiday…" />
        </FormControl>
        <HStack>
          <FormControl isRequired>
            <FormLabel>Target ({currency})</FormLabel>
            <MoneyInput value={target} onChange={setTarget} placeholder="0" />
          </FormControl>
          <FormControl>
            <FormLabel>Saved so far</FormLabel>
            <MoneyInput value={saved} onChange={setSaved} placeholder="0" />
          </FormControl>
        </HStack>
        <FormControl>
          <OptionalDate label="Set a target date" value={targetDate} onChange={setTargetDate} />
        </FormControl>
      </Stack>
    </FormModal>
  )
}
