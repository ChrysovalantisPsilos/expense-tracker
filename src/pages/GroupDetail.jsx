import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Heading, Stack, Card, CardBody, HStack, Text, Spacer, Button, Center,
  Spinner, Flex, Badge, IconButton, Divider, List, ListItem, useToast,
  useDisclosure, Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody,
  ModalFooter, FormControl, FormLabel, Select, Input, Tag,
} from '@chakra-ui/react'
import {
  ArrowLeft, Plus, UserPlus, Link2, Users, HandCoins, Paperclip,
} from 'lucide-react'
import { useAuth } from '../auth/AuthProvider.jsx'
import {
  getGroup, addMember, addSettlement, createInviteLink, computeBalances,
} from '../lib/groups.js'
import { formatMoney, toMinor } from '../lib/currency.js'
import { receiptUrl } from '../lib/receipts.js'
import GroupExpenseForm from '../components/GroupExpenseForm.jsx'

export default function GroupDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const toast = useToast()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [newMember, setNewMember] = useState('')
  const expenseModal = useDisclosure()
  const settleModal = useDisclosure()

  async function load() {
    try { setData(await getGroup(id)) }
    catch (e) { toast({ title: e.message, status: 'error' }) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [id])

  const balances = useMemo(() => data ? computeBalances(data) : new Map(), [data])
  const nameOf = (mid) => data?.members.find((m) => m.id === mid)?.display_name ?? '—'
  const myMember = data?.members.find((m) => m.user_id === user.id)
  const myNet = myMember ? (balances.get(myMember.id) ?? 0) : 0

  async function addPerson(e) {
    e.preventDefault()
    if (!newMember.trim()) return
    try {
      await addMember(id, newMember.trim())
      setNewMember('')
      load()
    } catch (e) { toast({ title: e.message, status: 'error' }) }
  }

  async function copyInvite(memberId = null) {
    try {
      const url = await createInviteLink(id, memberId)
      await navigator.clipboard.writeText(url)
      toast({ title: 'Invite link copied', description: url, status: 'success' })
    } catch (e) {
      toast({ title: 'Could not create invite', description: e.message, status: 'error' })
    }
  }

  async function openReceipt(path) {
    const url = await receiptUrl(path)
    if (url) window.open(url, '_blank', 'noopener')
  }

  if (loading) return <Center py={20}><Spinner color="brand.500" /></Center>
  if (!data) return <Text color="text.muted">Group not found.</Text>

  const { group, members, expenses, settlements } = data
  const cur = group.currency

  return (
    <Stack spacing={5}>
      <HStack>
        <IconButton aria-label="Back" variant="ghost" size="sm"
          icon={<ArrowLeft size={18} />} onClick={() => navigate('/groups')} />
        <Heading size="lg">{group.name}</Heading>
        <Spacer />
        <Button size="sm" leftIcon={<Plus size={16} />} onClick={expenseModal.onOpen}>Add expense</Button>
      </HStack>

      {/* Your balance summary */}
      <Card>
        <CardBody>
          <HStack>
            <Flex boxSize="44px" align="center" justify="center" borderRadius="xl"
              bg="bg.subtle" color="accent.fg"><HandCoins size={22} /></Flex>
            <Stack spacing={0}>
              <Text fontSize="sm" color="text.muted">Your balance</Text>
              <Text fontWeight="700" fontSize="lg"
                color={myNet > 0 ? 'green.500' : myNet < 0 ? 'red.500' : 'text.primary'}>
                {myNet === 0 ? "You're all settled up"
                  : myNet > 0 ? `You are owed ${formatMoney(myNet, cur)}`
                  : `You owe ${formatMoney(-myNet, cur)}`}
              </Text>
            </Stack>
            <Spacer />
            <Button size="sm" variant="outline" leftIcon={<HandCoins size={16} />}
              onClick={settleModal.onOpen}>Settle up</Button>
          </HStack>
        </CardBody>
      </Card>

      {/* Members */}
      <Card><CardBody>
        <HStack mb={3}>
          <Users size={18} />
          <Heading size="sm">Members</Heading>
          <Spacer />
          <Button size="xs" variant="ghost" leftIcon={<Link2 size={14} />}
            onClick={() => copyInvite(null)}>Invite link</Button>
        </HStack>
        <List spacing={0}>
          {members.map((m, i) => {
            const net = balances.get(m.id) ?? 0
            const isMe = m.user_id === user.id
            return (
              <ListItem key={m.id}>
                {i > 0 && <Divider />}
                <HStack py={2.5}>
                  <Text fontWeight={isMe ? '700' : '500'}>
                    {m.display_name}{isMe ? ' (you)' : ''}
                  </Text>
                  {m.role === 'owner' && <Badge colorScheme="brand">owner</Badge>}
                  {!m.user_id && <Tag size="sm" colorScheme="gray">pending</Tag>}
                  <Spacer />
                  {net !== 0 && (
                    <Text fontSize="sm" color={net > 0 ? 'green.500' : 'red.500'}>
                      {net > 0 ? `owed ${formatMoney(net, cur)}` : `owes ${formatMoney(-net, cur)}`}
                    </Text>
                  )}
                  {!m.user_id && (
                    <IconButton aria-label="Invite this person" size="xs" variant="ghost"
                      icon={<UserPlus size={14} />} onClick={() => copyInvite(m.id)} />
                  )}
                </HStack>
              </ListItem>
            )
          })}
        </List>
        <form onSubmit={addPerson}>
          <HStack mt={3}>
            <Input size="sm" placeholder="Add a person by name" value={newMember}
              onChange={(e) => setNewMember(e.target.value)} />
            <Button size="sm" type="submit" leftIcon={<Plus size={14} />}>Add</Button>
          </HStack>
        </form>
      </CardBody></Card>

      {/* Expenses */}
      <Card><CardBody>
        <Heading size="sm" mb={3}>Expenses</Heading>
        {expenses.length === 0 ? (
          <Text color="text.muted" fontSize="sm">No shared expenses yet.</Text>
        ) : (
          <List spacing={0}>
            {expenses.map((e, i) => (
              <ListItem key={e.id}>
                {i > 0 && <Divider />}
                <HStack py={3} spacing={3} align="start">
                  <Stack spacing={0} flex="1">
                    <Text fontWeight="600">{e.description || 'Expense'}</Text>
                    <Text fontSize="xs" color="text.muted">
                      {nameOf(e.paid_by)} paid · {e.spent_at} · split {e.expense_splits?.length ?? 0} ways
                    </Text>
                  </Stack>
                  {e.receipt_path && (
                    <IconButton aria-label="Receipt" size="xs" variant="ghost"
                      icon={<Paperclip size={14} />} onClick={() => openReceipt(e.receipt_path)} />
                  )}
                  <Text fontWeight="600">{formatMoney(e.amount_minor, e.currency)}</Text>
                </HStack>
              </ListItem>
            ))}
          </List>
        )}
      </CardBody></Card>

      {/* Settlement history */}
      {settlements.length > 0 && (
        <Card><CardBody>
          <Heading size="sm" mb={3}>Settlements</Heading>
          <List spacing={2}>
            {settlements.map((s) => (
              <ListItem key={s.id}>
                <HStack fontSize="sm">
                  <Text>{nameOf(s.from_member)} → {nameOf(s.to_member)}</Text>
                  <Spacer />
                  <Text color="text.muted">{s.settled_at}</Text>
                  <Text fontWeight="600">{formatMoney(s.amount_minor, s.currency)}</Text>
                </HStack>
              </ListItem>
            ))}
          </List>
        </CardBody></Card>
      )}

      <GroupExpenseForm group={group} members={members} defaultPayer={myMember?.id}
        isOpen={expenseModal.isOpen} onClose={expenseModal.onClose} onSaved={load} />

      <SettleUpModal group={group} members={members} defaultFrom={myMember?.id}
        isOpen={settleModal.isOpen} onClose={settleModal.onClose} onSaved={load} />
    </Stack>
  )
}

function SettleUpModal({ group, members, defaultFrom, isOpen, onClose, onSaved }) {
  const toast = useToast()
  const [from, setFrom] = useState(defaultFrom ?? members[0]?.id ?? '')
  const [to, setTo] = useState(members.find((m) => m.id !== defaultFrom)?.id ?? '')
  const [amount, setAmount] = useState('')
  const [settledAt, setSettledAt] = useState(() => new Date().toISOString().slice(0, 10))
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (from === to) return toast({ title: 'Pick two different people', status: 'warning' })
    if (!amount || Number(amount) <= 0) return toast({ title: 'Enter an amount', status: 'warning' })
    setBusy(true)
    try {
      await addSettlement({
        groupId: group.id, fromMember: from, toMember: to,
        amountMinor: toMinor(amount, group.currency), currency: group.currency, settledAt,
      })
      toast({ title: 'Settlement recorded', status: 'success' })
      onSaved?.(); onClose(); setAmount('')
    } catch (e) { toast({ title: e.message, status: 'error' }) }
    finally { setBusy(false) }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered>
      <ModalOverlay />
      <ModalContent as="form" onSubmit={submit} mx={4}>
        <ModalHeader>Record a settlement</ModalHeader>
        <ModalBody>
          <Stack spacing={4}>
            <FormControl isRequired>
              <FormLabel>Who paid</FormLabel>
              <Select value={from} onChange={(e) => setFrom(e.target.value)}>
                {members.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}
              </Select>
            </FormControl>
            <FormControl isRequired>
              <FormLabel>Who received</FormLabel>
              <Select value={to} onChange={(e) => setTo(e.target.value)}>
                {members.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}
              </Select>
            </FormControl>
            <HStack>
              <FormControl isRequired>
                <FormLabel>Amount ({group.currency})</FormLabel>
                <Input type="number" step="0.01" inputMode="decimal" value={amount}
                  onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
              </FormControl>
              <FormControl maxW="160px">
                <FormLabel>Date</FormLabel>
                <Input type="date" value={settledAt} onChange={(e) => setSettledAt(e.target.value)} />
              </FormControl>
            </HStack>
          </Stack>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={busy}>Record</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
