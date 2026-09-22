import { useMemo, useState } from 'react'
import {
  Stack, Card, CardBody, HStack, Text, Spacer, Button, Center, Spinner,
  Box, SimpleGrid, Stat, StatLabel, StatNumber, StatHelpText, StatArrow,
  Progress, List, ListItem, Divider, IconButton, Select, Input, FormControl,
  FormLabel, Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody,
  ModalFooter, useToast, useDisclosure, Tag,
} from '@chakra-ui/react'
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend, CartesianGrid,
} from 'recharts'
import { Plus, Pencil, Trash2, PiggyBank, TrendingUp, Wallet } from 'lucide-react'
import OptionalDate from '../../shared/ui/OptionalDate.jsx'
import PageHeader from '../../shared/ui/PageHeader.jsx'
import CardHeader from '../../shared/ui/CardHeader.jsx'
import { useChartTheme } from '../../shared/ui/useChartTheme.jsx'
import { useTransactions } from '../transactions/useData.js'
import { lastMonths, shortDate } from '../../shared/lib/dates.js'
import { useAsyncSubmit } from '../../shared/lib/useAsyncSubmit.js'
import { useProfile } from '../../shared/lib/useProfile.js'
import { formatMoney, toMinor, fromMinor, minorFactor } from '../../shared/lib/currency.js'
import {
  useAccounts, saveAccount, deleteAccount,
  useGoals, saveGoal, deleteGoal,
} from './insights.js'
import { buildTrend, spendDelta, netWorth, axisTick } from './insightsMath.js'
import ReportsCard from './ReportsCard.jsx'

export default function Insights() {
  const { baseCurrency = 'EUR' } = useProfile()
  const months = useMemo(() => lastMonths(6), [])
  const { rows, loading } = useTransactions({ from: months[0].from, to: months[months.length - 1].to })

  const factor = minorFactor(baseCurrency)
  // Trend values are major units (chart axis); formatting converts back to minor.
  const trend = useMemo(() => buildTrend(rows, months, baseCurrency), [rows, months, baseCurrency])
  const delta = spendDelta(trend)
  const chart = useChartTheme()

  return (
    <Stack spacing={5}>
      <PageHeader title="Insights" />

      <Card><CardBody>
        <CardHeader icon={TrendingUp} title="6-month trend" action={delta != null && (
          <Stat textAlign="right" size="sm">
            <StatHelpText mb={0}>
              {/* Spending: up is the bad direction, so it takes the negative tone. */}
              <StatArrow type={delta > 0 ? 'increase' : 'decrease'}
                color={delta > 0 ? 'status.negative' : 'status.positive'} />
              {Math.abs(delta)}%
              {/* The comparison words drop on phones so the title keeps its room. */}
              <Box as="span" display={{ base: 'none', sm: 'inline' }}> vs last month</Box>
            </StatHelpText>
          </Stat>
        )} />
        {loading ? (
          <Center py={10}><Spinner color="brand.500" /></Center>
        ) : (
          <Box h="260px">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chart.grid} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} tick={chart.tick} />
                <YAxis tickLine={false} axisLine={false} fontSize={11} tick={chart.tick}
                  tickFormatter={axisTick} width={44} />
                <Tooltip formatter={(v) => formatMoney(Math.round(v * factor), baseCurrency)} {...chart.tooltip} />
                <Legend formatter={chart.legendFormatter} />
                <Bar dataKey="income" name="Income" fill={chart.positive} radius={[4, 4, 0, 0]} />
                <Bar dataKey="expense" name="Expenses" fill={chart.series[0]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Box>
        )}
      </CardBody></Card>

      <NetWorthCard baseCurrency={baseCurrency} />
      <GoalsCard baseCurrency={baseCurrency} />
      <ReportsCard />
    </Stack>
  )
}

// ── Net worth ───────────────────────────────────────────────────────────────
function NetWorthCard({ baseCurrency }) {
  const { accounts, loading, reload } = useAccounts()
  const toast = useToast()
  const modal = useDisclosure()
  const [editing, setEditing] = useState(null)

  const { assets, liabilities, net } = useMemo(() => netWorth(accounts), [accounts])

  async function remove(acc) {
    try { await deleteAccount(acc.id); reload() }
    catch (e) { toast({ title: e.message, status: 'error' }) }
  }

  return (
    <Card><CardBody>
      <CardHeader icon={Wallet} title="Net worth" action={
        <Button size="xs" leftIcon={<Plus size={14} />}
          onClick={() => { setEditing(null); modal.onOpen() }}>Account</Button>
      } />

      {loading ? (
        <Center py={6}><Spinner color="brand.500" /></Center>
      ) : (
        <>
          <SimpleGrid columns={3} spacing={3} mb={accounts.length ? 4 : 0}>
            <Stat size="sm"><StatLabel>Assets</StatLabel>
              <StatNumber fontSize="lg" color="status.positive">{formatMoney(assets, baseCurrency)}</StatNumber></Stat>
            <Stat size="sm"><StatLabel>Debts</StatLabel>
              <StatNumber fontSize="lg" color="status.negative">{formatMoney(liabilities, baseCurrency)}</StatNumber></Stat>
            <Stat size="sm"><StatLabel>Net</StatLabel>
              <StatNumber fontSize="lg" color={net >= 0 ? 'text.primary' : 'status.negative'}>
                {formatMoney(net, baseCurrency)}</StatNumber></Stat>
          </SimpleGrid>

          {accounts.length === 0 ? (
            <Text color="text.muted" fontSize="sm">
              Add your account balances (bank, savings, card, loan) to track net worth.
            </Text>
          ) : (
            <List spacing={0}>
              {accounts.map((acc, i) => (
                <ListItem key={acc.id}>
                  {i > 0 && <Divider />}
                  <HStack py={2.5} spacing={3}>
                    <Text fontWeight="600" noOfLines={1} flex="1">{acc.name}</Text>
                    <Tag size="sm" bg="bg.subtle"
                      color={acc.type === 'liability' ? 'status.negative' : 'status.positive'}>
                      {acc.type === 'liability' ? 'Debt' : 'Asset'}
                    </Tag>
                    <Text fontWeight="600" color={acc.type === 'liability' ? 'status.negative' : 'text.primary'}>
                      {acc.type === 'liability' ? '−' : ''}{formatMoney(acc.balance_minor, acc.currency)}
                    </Text>
                    <IconButton aria-label="Edit" size="xs" variant="ghost" icon={<Pencil size={14} />}
                      onClick={() => { setEditing(acc); modal.onOpen() }} />
                    <IconButton aria-label="Delete" size="xs" variant="ghost" color="status.negative"
                      icon={<Trash2 size={14} />} onClick={() => remove(acc)} />
                  </HStack>
                </ListItem>
              ))}
            </List>
          )}
        </>
      )}

      {modal.isOpen && (
        <AccountModal account={editing} baseCurrency={baseCurrency}
          onClose={modal.onClose} onSaved={() => { modal.onClose(); reload() }} />
      )}
    </CardBody></Card>
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

  async function submit(e) {
    e.preventDefault()
    if (!name.trim()) return toast({ title: 'Name it', status: 'warning' })
    await run(async () => {
      await saveAccount({
        id: account?.id, name: name.trim(), type,
        balance_minor: toMinor(balance || '0', currency), currency,
      })
      onSaved()
    })
  }

  return (
    <Modal isOpen onClose={onClose} isCentered>
      <ModalOverlay />
      <ModalContent as="form" onSubmit={submit} mx={4}>
        <ModalHeader>{isEdit ? 'Edit account' : 'Add account'}</ModalHeader>
        <ModalBody>
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
              <Input type="number" inputMode="decimal" value={balance}
                onChange={(e) => setBalance(e.target.value)} placeholder="0" />
            </FormControl>
          </Stack>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={busy}>{isEdit ? 'Save' : 'Add'}</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}

// ── Goals ───────────────────────────────────────────────────────────────────
function GoalsCard({ baseCurrency }) {
  const { goals, loading, reload } = useGoals()
  const toast = useToast()
  const modal = useDisclosure()
  const [editing, setEditing] = useState(null)

  async function remove(g) {
    try { await deleteGoal(g.id); reload() }
    catch (e) { toast({ title: e.message, status: 'error' }) }
  }
  async function addTo(g, deltaMinor) {
    try {
      // Send the full goal — the encrypting save RPC rewrites every field.
      await saveGoal({ ...g, saved_minor: Math.max(0, g.saved_minor + deltaMinor) })
      reload()
    } catch (e) { toast({ title: e.message, status: 'error' }) }
  }

  return (
    <Card><CardBody>
      <CardHeader icon={PiggyBank} title="Savings goals" action={
        <Button size="xs" leftIcon={<Plus size={14} />}
          onClick={() => { setEditing(null); modal.onOpen() }}>Goal</Button>
      } />

      {loading ? (
        <Center py={6}><Spinner color="brand.500" /></Center>
      ) : goals.length === 0 ? (
        <Text color="text.muted" fontSize="sm">No goals yet — set one to start saving toward it.</Text>
      ) : (
        <Stack spacing={4} divider={<Divider />}>
          {goals.map((g) => {
            const pct = g.target_minor > 0 ? Math.min(100, Math.round((g.saved_minor / g.target_minor) * 100)) : 0
            const done = g.saved_minor >= g.target_minor && g.target_minor > 0
            const step = Math.max(1, Math.round(g.target_minor / 10))
            return (
              <Box key={g.id}>
                <HStack mb={1}>
                  <Text fontWeight="600" noOfLines={1} flex="1">{g.name}</Text>
                  {done && <Tag size="sm" bg="bg.subtle" color="status.positive">Reached 🎉</Tag>}
                  <IconButton aria-label="Edit" size="xs" variant="ghost" icon={<Pencil size={13} />}
                    onClick={() => { setEditing(g); modal.onOpen() }} />
                  <IconButton aria-label="Delete" size="xs" variant="ghost" color="status.negative"
                    icon={<Trash2 size={13} />} onClick={() => remove(g)} />
                </HStack>
                <Progress value={pct} variant={done ? 'positive' : undefined} size="sm" mb={1} />
                <HStack fontSize="sm" color="text.muted">
                  <Text>{formatMoney(g.saved_minor, g.currency)} of {formatMoney(g.target_minor, g.currency)}</Text>
                  <Spacer />
                  <Text>{pct}%{g.target_date ? ` · by ${shortDate(g.target_date)}` : ''}</Text>
                </HStack>
                {!done && (
                  <HStack mt={2} spacing={2}>
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
    </CardBody></Card>
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

  async function submit(e) {
    e.preventDefault()
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
    <Modal isOpen onClose={onClose} isCentered>
      <ModalOverlay />
      <ModalContent as="form" onSubmit={submit} mx={4}>
        <ModalHeader>{isEdit ? 'Edit goal' : 'New goal'}</ModalHeader>
        <ModalBody>
          <Stack spacing={4}>
            <FormControl isRequired>
              <FormLabel>Name</FormLabel>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Emergency fund, holiday…" />
            </FormControl>
            <HStack>
              <FormControl isRequired>
                <FormLabel>Target ({currency})</FormLabel>
                <Input type="number" inputMode="decimal" value={target}
                  onChange={(e) => setTarget(e.target.value)} placeholder="0" />
              </FormControl>
              <FormControl>
                <FormLabel>Saved so far</FormLabel>
                <Input type="number" inputMode="decimal" value={saved}
                  onChange={(e) => setSaved(e.target.value)} placeholder="0" />
              </FormControl>
            </HStack>
            <FormControl>
              <OptionalDate label="Set a target date" value={targetDate} onChange={setTargetDate} />
            </FormControl>
          </Stack>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={busy}>{isEdit ? 'Save' : 'Add'}</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
