import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Heading, Stack, Card, CardBody, HStack, Text, Spacer, Button, Center,
  Spinner, Flex, Badge, IconButton, Divider, List, ListItem, useToast,
  useDisclosure, Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody,
  ModalFooter, FormControl, FormLabel, Select, Input, Tag,
  Menu, MenuButton, MenuList, MenuItem,
} from '@chakra-ui/react'
import {
  ArrowLeft, Plus, UserPlus, Link2, Users, HandCoins, Paperclip, Mail,
  MoreVertical, LogOut, Trash2, UserMinus,
} from 'lucide-react'
import { useAuth } from '../auth/AuthProvider.jsx'
import {
  getGroup, addMember, addSettlement, createInviteLink, createInvite,
  emailInvite, computeBalances, removeMember, deleteGroup,
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
  const inviteModal = useDisclosure()
  const leaveModal = useDisclosure()
  const deleteModal = useDisclosure()
  const [removeTarget, setRemoveTarget] = useState(null)
  const [actionBusy, setActionBusy] = useState(false)

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

  async function doLeave() {
    setActionBusy(true)
    try {
      await removeMember(myMember.id)
      toast({ title: 'You left the group', status: 'success' })
      navigate('/groups')
    } catch (e) { toast({ title: 'Couldn’t leave', description: e.message, status: 'error' }) }
    finally { setActionBusy(false); leaveModal.onClose() }
  }

  async function doDelete() {
    setActionBusy(true)
    try {
      await deleteGroup(id)
      toast({ title: 'Group deleted', status: 'success' })
      navigate('/groups')
    } catch (e) { toast({ title: 'Couldn’t delete', description: e.message, status: 'error' }) }
    finally { setActionBusy(false); deleteModal.onClose() }
  }

  async function doRemove() {
    if (!removeTarget) return
    setActionBusy(true)
    try {
      await removeMember(removeTarget.id)
      toast({ title: `Removed ${removeTarget.display_name}`, status: 'success' })
      setRemoveTarget(null)
      load()
    } catch (e) { toast({ title: 'Couldn’t remove', description: e.message, status: 'error' }) }
    finally { setActionBusy(false) }
  }

  if (loading) return <Center py={20}><Spinner color="brand.500" /></Center>
  if (!data) return <Text color="text.muted">Group not found.</Text>

  const { group, members, expenses, settlements } = data
  const cur = group.currency
  const isOwner = group.owner_id === user.id

  return (
    <Stack spacing={5}>
      <HStack>
        <IconButton aria-label="Back" variant="ghost" size="sm"
          icon={<ArrowLeft size={18} />} onClick={() => navigate('/groups')} />
        <Heading size="lg">{group.name}</Heading>
        <Spacer />
        <Button size="sm" leftIcon={<Plus size={16} />} onClick={expenseModal.onOpen}>Add expense</Button>
        <Menu>
          <MenuButton as={IconButton} aria-label="Group options" size="sm"
            variant="ghost" icon={<MoreVertical size={18} />} />
          <MenuList>
            {myMember && (
              <MenuItem icon={<LogOut size={16} />} onClick={leaveModal.onOpen}>
                Leave group
              </MenuItem>
            )}
            {isOwner && (
              <MenuItem icon={<Trash2 size={16} />} color="red.500" onClick={deleteModal.onOpen}>
                Delete group
              </MenuItem>
            )}
          </MenuList>
        </Menu>
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
          <Button size="xs" variant="ghost" leftIcon={<Mail size={14} />}
            onClick={inviteModal.onOpen}>Email</Button>
          <Button size="xs" variant="ghost" leftIcon={<Link2 size={14} />}
            onClick={() => copyInvite(null)}>Link</Button>
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
                  {isOwner && !isMe && (
                    <IconButton aria-label={`Remove ${m.display_name}`} size="xs" variant="ghost"
                      color="red.400" icon={<UserMinus size={14} />}
                      onClick={() => setRemoveTarget(m)} />
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

      <InviteEmailModal group={group} inviterName={myMember?.display_name}
        isOpen={inviteModal.isOpen} onClose={inviteModal.onClose} />

      {/* Leave confirm */}
      <Modal isOpen={leaveModal.isOpen} onClose={leaveModal.onClose} isCentered>
        <ModalOverlay />
        <ModalContent mx={4}>
          <ModalHeader>Leave “{group.name}”?</ModalHeader>
          <ModalBody>
            <Text color="text.muted">
              You can only leave once your balance is settled. Your past expenses
              stay in the group for everyone else.
              {isOwner && ' As the owner, ownership passes to another member.'}
            </Text>
          </ModalBody>
          <ModalFooter gap={2}>
            <Button variant="ghost" onClick={leaveModal.onClose}>Cancel</Button>
            <Button colorScheme="red" isLoading={actionBusy} onClick={doLeave}>Leave</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Delete confirm (type-to-confirm) */}
      <DeleteGroupModal group={group} isOpen={deleteModal.isOpen} onClose={deleteModal.onClose}
        busy={actionBusy} onConfirm={doDelete} />

      {/* Remove member confirm */}
      <Modal isOpen={!!removeTarget} onClose={() => setRemoveTarget(null)} isCentered>
        <ModalOverlay />
        <ModalContent mx={4}>
          <ModalHeader>Remove {removeTarget?.display_name}?</ModalHeader>
          <ModalBody>
            <Text color="text.muted">
              They can only be removed if settled up. If they’ve been part of any
              expenses, their history is kept.
            </Text>
          </ModalBody>
          <ModalFooter gap={2}>
            <Button variant="ghost" onClick={() => setRemoveTarget(null)}>Cancel</Button>
            <Button colorScheme="red" isLoading={actionBusy} onClick={doRemove}>Remove</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Stack>
  )
}

function DeleteGroupModal({ group, isOpen, onClose, busy, onConfirm }) {
  const [text, setText] = useState('')
  const match = text.trim() === group.name
  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered>
      <ModalOverlay />
      <ModalContent mx={4}>
        <ModalHeader>Delete “{group.name}”?</ModalHeader>
        <ModalBody>
          <Stack spacing={3}>
            <Text color="text.muted">
              This permanently deletes the group and all its expenses, balances,
              and settlements for <b>everyone</b> — and removes the shared
              expenses mirrored into members’ personal trackers. Only possible
              when everyone is settled up. This can’t be undone.
            </Text>
            <FormControl>
              <FormLabel fontSize="sm">Type the group name to confirm</FormLabel>
              <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={group.name} />
            </FormControl>
          </Stack>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button colorScheme="red" isDisabled={!match} isLoading={busy} onClick={onConfirm}>
            Delete group
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}

function InviteEmailModal({ group, inviterName, isOpen, onClose }) {
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (!email.trim()) return
    setBusy(true)
    try {
      const { url } = await createInvite(group.id, { email: email.trim() })
      try {
        await emailInvite({ to: email.trim(), url, groupName: group.name, inviterName })
        toast({ title: `Invite emailed to ${email.trim()}`, status: 'success' })
      } catch (mailErr) {
        // Email not configured (or failed): fall back to the share link.
        await navigator.clipboard.writeText(url)
        toast({
          title: 'Couldn’t send the email — link copied instead',
          description: mailErr.message, status: 'warning', duration: 8000,
        })
      }
      onClose(); setEmail('')
    } catch (e) {
      toast({ title: e.message, status: 'error' })
    } finally { setBusy(false) }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered>
      <ModalOverlay />
      <ModalContent as="form" onSubmit={submit} mx={4}>
        <ModalHeader>Invite by email</ModalHeader>
        <ModalBody>
          <FormControl isRequired>
            <FormLabel>Email address</FormLabel>
            <Input type="email" autoFocus value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder="friend@example.com" />
          </FormControl>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={busy}>Send invite</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
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
