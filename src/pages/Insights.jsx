import { useMemo, useState } from 'react'
import {
  Heading, Stack, Card, CardBody, HStack, Text, Spacer, Button, Center, Spinner,
  Box, SimpleGrid, Stat, StatLabel, StatNumber, StatHelpText, StatArrow,
  Progress, List, ListItem, Divider, IconButton, Select, Input, FormControl,
  FormLabel, Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody,
  ModalFooter, useToast, useDisclosure, Tag,
} from '@chakra-ui/react'
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend, CartesianGrid,
} from 'recharts'
import { Plus, Pencil, Trash2, Target, TrendingUp, Wallet } from 'lucide-react'
import OptionalDate from '../components/OptionalDate.jsx'
import { useTransactions } from '../lib/useData.js'
import { lastMonths } from '../lib/dates.js'
import { useProfile } from '../lib/useProfile.js'
import { formatMoney, toBaseMinor, toMinor, fromMinor, minorFactor } from '../lib/currency.js'
import {
  useAccounts, saveAccount, deleteAccount,
  useGoals, saveGoal, deleteGoal,
} from '../lib/insights.js'

export default function Insights() {
  const { baseCurrency = 'EUR' } = useProfile()
  const months = useMemo(() => lastMonths(6), [])
  const { rows, loading } = useTransactions({ from: months[0].from, to: months[months.length - 1].to })

  const factor = minorFactor(baseCurrency)
  const trend = useMemo(() => {
    const by = new Map(months.map((m) => [m.key, { label: m.label, income: 0, expense: 0 }]))
    for (const r of rows) {
      const key = String(r.spent_at).slice(0, 7)
      const bucket = by.get(key)
      if (!bucket) continue
      // Major units for the chart axis; converted back to minor for formatting.
      const base = toBaseMinor(r.amount_minor, r.exchange_rate, r.currency, baseCurrency) / factor
      if (r.kind === 'income') bucket.income += base
      else bucket.expense += base
    }
    return [...by.values()]
  }, [rows, months, baseCurrency, factor])

  const thisM = trend[trend.length - 1]
  const lastM = trend[trend.length - 2]
  const spendDelta = thisM && lastM && lastM.expense > 0
    ? Math.round(((thisM.expense - lastM.expense) / lastM.expense) * 100)
    : null

  return (
    <Stack spacing={5}>
      <Heading size="lg">Insights</Heading>

      <Card><CardBody>
        <HStack mb={4}>
          <Box color="accent.fg"><TrendingUp size={18} /></Box>
          <Heading size="sm">6-month trend</Heading>
          <Spacer />
          {spendDelta != null && (
            <Stat textAlign="right" size="sm">
              <StatHelpText mb={0}>
                <StatArrow type={spendDelta > 0 ? 'increase' : 'decrease'} />
                {Math.abs(spendDelta)}% vs last month
              </StatHelpText>
            </Stat>
          )}
        </HStack>
        {loading ? (
          <Center py={10}><Spinner color="brand.500" /></Center>
        ) : (
          <Box h="260px">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={11}
                  tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)} />
                <Tooltip formatter={(v) => formatMoney(Math.round(v * factor), baseCurrency)} />
                <Legend />
                <Bar dataKey="income" name="Income" fill="#16a34a" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expense" name="Expenses" fill="#f95d38" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Box>
        )}
      </CardBody></Card>

      <NetWorthCard baseCurrency={baseCurrency} />
      <GoalsCard baseCurrency={baseCurrency} />
    </Stack>
  )
}

// ── Net worth ───────────────────────────────────────────────────────────────
function NetWorthCard({ baseCurrency }) {
  const { accounts, loading, reload } = useAccounts()
  const toast = useToast()
  const modal = useDisclosure()
  const [editing, setEditing] = useState(null)

  const { assets, liabilities } = useMemo(() => {
    let a = 0, l = 0
    for (const acc of accounts) {
      if (acc.type === 'liability') l += acc.balance_minor
      else a += acc.balance_minor
    }
    return { assets: a, liabilities: l }
  }, [accounts])
  const net = assets - liabilities

  async function remove(acc) {
    try { await deleteAccount(acc.id); reload() }
    catch (e) { toast({ title: e.message, status: 'error' }) }
  }

  return (
    <Card><CardBody>
      <HStack mb={4}>
        <Box color="accent.fg"><Wallet size={18} /></Box>
        <Heading size="sm">Net worth</Heading>
        <Spacer />
        <Button size="xs" leftIcon={<Plus size={14} />}
          onClick={() => { setEditing(null); modal.onOpen() }}>Account</Button>
      </HStack>

      {loading ? (
        <Center py={6}><Spinner color="brand.500" /></Center>
      ) : (
        <>
          <SimpleGrid columns={3} spacing={3} mb={accounts.length ? 4 : 0}>
            <Stat size="sm"><StatLabel>Assets</StatLabel>
              <StatNumber fontSize="lg" color="green.500">{formatMoney(assets, baseCurrency)}</StatNumber></Stat>
            <Stat size="sm"><StatLabel>Debts</StatLabel>
              <StatNumber fontSize="lg" color="red.400">{formatMoney(liabilities, baseCurrency)}</StatNumber></Stat>
            <Stat size="sm"><StatLabel>Net</StatLabel>
              <StatNumber fontSize="lg" color={net >= 0 ? 'text.primary' : 'red.400'}>
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
                    <Tag size="sm" colorScheme={acc.type === 'liability' ? 'red' : 'green'}>
                      {acc.type === 'liability' ? 'Debt' : 'Asset'}
                    </Tag>
                    <Text fontWeight="600" color={acc.type === 'liability' ? 'red.400' : 'text.primary'}>
                      {acc.type === 'liability' ? '−' : ''}{formatMoney(acc.balance_minor, acc.currency)}
                    </Text>
                    <IconButton aria-label="Edit" size="xs" variant="ghost" icon={<Pencil size={14} />}
                      onClick={() => { setEditing(acc); modal.onOpen() }} />
                    <IconButton aria-label="Delete" size="xs" variant="ghost" color="red.400"
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
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (!name.trim()) return toast({ title: 'Name it', status: 'warning' })
    setBusy(true)
    try {
      await saveAccount({
        id: account?.id, name: name.trim(), type,
        balance_minor: toMinor(balance || '0', currency), currency,
      })
      onSaved()
    } catch (err) { toast({ title: err.message, status: 'error' }) }
    finally { setBusy(false) }
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
      await saveGoal({ id: g.id, saved_minor: Math.max(0, g.saved_minor + deltaMinor) })
      reload()
    } catch (e) { toast({ title: e.message, status: 'error' }) }
  }

  return (
    <Card><CardBody>
      <HStack mb={4}>
        <Box color="accent.fg"><Target size={18} /></Box>
        <Heading size="sm">Savings goals</Heading>
        <Spacer />
        <Button size="xs" leftIcon={<Plus size={14} />}
          onClick={() => { setEditing(null); modal.onOpen() }}>Goal</Button>
      </HStack>

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
                  {done && <Tag size="sm" colorScheme="green">Reached 🎉</Tag>}
                  <IconButton aria-label="Edit" size="xs" variant="ghost" icon={<Pencil size={13} />}
                    onClick={() => { setEditing(g); modal.onOpen() }} />
                  <IconButton aria-label="Delete" size="xs" variant="ghost" color="red.400"
                    icon={<Trash2 size={13} />} onClick={() => remove(g)} />
                </HStack>
                <Progress value={pct} colorScheme={done ? 'green' : 'brand'} borderRadius="full" size="sm" mb={1} />
                <HStack fontSize="sm" color="text.muted">
                  <Text>{formatMoney(g.saved_minor, g.currency)} of {formatMoney(g.target_minor, g.currency)}</Text>
                  <Spacer />
                  <Text>{pct}%{g.target_date ? ` · by ${g.target_date}` : ''}</Text>
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
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (!name.trim()) return toast({ title: 'Name it', status: 'warning' })
    if (!target || Number(target) <= 0) return toast({ title: 'Set a target', status: 'warning' })
    setBusy(true)
    try {
      await saveGoal({
        id: goal?.id, name: name.trim(),
        target_minor: toMinor(target, currency), saved_minor: toMinor(saved || '0', currency),
        currency, target_date: targetDate || null,
      })
      onSaved()
    } catch (err) { toast({ title: err.message, status: 'error' }) }
    finally { setBusy(false) }
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
