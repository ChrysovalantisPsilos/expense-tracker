import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Heading, Stack, Card, CardBody, HStack, Text, Spacer, Button, Center, Box,
  Spinner, Flex, Badge, IconButton, Divider, List, ListItem, useToast,
  useDisclosure, Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody,
  ModalFooter, FormControl, FormLabel, Select, Input, Avatar,
  Menu, MenuButton, MenuList, MenuItem,
} from '@chakra-ui/react'
import {
  ArrowLeft, Plus, Link2, Users, HandCoins, Paperclip, Mail,
  MoreVertical, LogOut, Trash2, UserMinus, Pencil, ArrowRight, Camera,
} from 'lucide-react'
import { useAuth } from '../auth/AuthProvider.jsx'
import {
  getGroup, addSettlement, createInviteLink, createInvite,
  emailInvite, computeBalances, removeMember, deleteGroup, inviteExistingUser,
  renameGroup, uploadGroupImage,
} from '../lib/groups.js'
import { formatMoney, toMinor } from '../lib/currency.js'
import { receiptUrl } from '../lib/receipts.js'
import GroupExpenseForm from '../components/GroupExpenseForm.jsx'
import MoneyInput from '../components/MoneyInput.jsx'

export default function GroupDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const toast = useToast()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const expenseModal = useDisclosure()
  const settleModal = useDisclosure()
  const inviteModal = useDisclosure()
  const leaveModal = useDisclosure()
  const deleteModal = useDisclosure()
  const renameModal = useDisclosure()
  const [removeTarget, setRemoveTarget] = useState(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [editingExpense, setEditingExpense] = useState(null)
  const [uploadingImg, setUploadingImg] = useState(false)
  const imgRef = useRef(null)

  function openAdd() { setEditingExpense(null); expenseModal.onOpen() }
  function openEdit(exp) { setEditingExpense(exp); expenseModal.onOpen() }
  function closeExpense() { expenseModal.onClose(); setEditingExpense(null) }

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

  async function onGroupImage(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploadingImg(true)
    try {
      await uploadGroupImage(id, file)
      await load()
      toast({ title: 'Group photo updated', status: 'success' })
    } catch (e) { toast({ title: 'Couldn’t update photo', description: e.message, status: 'error' }) }
    finally { setUploadingImg(false) }
  }

  async function copyInvite() {
    try {
      const url = await createInviteLink(id)
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
        <Box position="relative" flexShrink={0}>
          <Avatar borderRadius="lg" size="md" name={group.name} src={group.image_url} />
          {isOwner && (
            <>
              <IconButton aria-label="Change group photo" icon={<Camera size={12} />}
                size="xs" borderRadius="full" position="absolute" bottom="-6px" right="-6px"
                isLoading={uploadingImg} onClick={() => imgRef.current?.click()} />
              <input ref={imgRef} type="file" accept="image/*" hidden onChange={onGroupImage} />
            </>
          )}
        </Box>
        <Heading size="lg" noOfLines={1}>{group.name}</Heading>
        <Spacer />
        <Button size="sm" leftIcon={<Plus size={16} />} onClick={openAdd}>Add expense</Button>
        <Menu>
          <MenuButton as={IconButton} aria-label="Group options" size="sm"
            variant="ghost" icon={<MoreVertical size={18} />} />
          <MenuList>
            {isOwner && (
              <MenuItem icon={<Pencil size={16} />} onClick={renameModal.onOpen}>
                Rename group
              </MenuItem>
            )}
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
            onClick={copyInvite}>Link</Button>
        </HStack>
        <List spacing={0}>
          {members.map((m, i) => {
            const net = balances.get(m.id) ?? 0
            const isMe = m.user_id === user.id
            return (
              <ListItem key={m.id}>
                {i > 0 && <Divider />}
                <HStack py={2.5}>
                  <Avatar size="xs" name={m.display_name} src={m.avatar_url}
                    {...(isMe ? { bg: 'brand.500', color: 'white' } : {})} />
                  <Text fontWeight={isMe ? '700' : '500'}>
                    {m.display_name}{isMe ? ' (you)' : ''}
                  </Text>
                  {m.role === 'owner' && <Badge colorScheme="brand">owner</Badge>}
                  <Spacer />
                  {net !== 0 && (
                    <Text fontSize="sm" color={net > 0 ? 'green.500' : 'red.500'}>
                      {net > 0 ? `owed ${formatMoney(net, cur)}` : `owes ${formatMoney(-net, cur)}`}
                    </Text>
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
        <Text fontSize="xs" color="text.muted" mt={3}>
          Invite people by email or a share link — they join once they accept.
        </Text>
      </CardBody></Card>

      {/* Expenses */}
      <Card><CardBody>
        <Heading size="sm" mb={3}>Expenses</Heading>
        {expenses.length === 0 ? (
          <Text color="text.muted" fontSize="sm">No shared expenses yet.</Text>
        ) : (
          <List spacing={0}>
            {expenses.map((e, i) => {
              const canEdit = e.created_by === user.id || isOwner
              return (
              <ListItem key={e.id}>
                {i > 0 && <Divider />}
                <HStack py={3} spacing={3} align="start"
                  cursor={canEdit ? 'pointer' : 'default'}
                  onClick={canEdit ? () => openEdit(e) : undefined}
                  _hover={canEdit ? { opacity: 0.75 } : undefined} transition="opacity 0.1s">
                  <Stack spacing={0} flex="1">
                    <Text fontWeight="600">{e.description || 'Expense'}</Text>
                    <Text fontSize="xs" color="text.muted">
                      {nameOf(e.paid_by)} paid · {e.spent_at} · split {e.expense_splits?.length ?? 0} ways
                    </Text>
                  </Stack>
                  {e.receipt_path && (
                    <IconButton aria-label="Receipt" size="xs" variant="ghost"
                      icon={<Paperclip size={14} />}
                      onClick={(ev) => { ev.stopPropagation(); openReceipt(e.receipt_path) }} />
                  )}
                  <Text fontWeight="600">{formatMoney(e.amount_minor, e.currency)}</Text>
                </HStack>
              </ListItem>
              )
            })}
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

      <GroupExpenseForm key={editingExpense?.id || 'new'} group={group} members={members}
        defaultPayer={myMember?.id} expense={editingExpense}
        isOpen={expenseModal.isOpen} onClose={closeExpense} onSaved={load} />

      <SettleUpModal group={group} members={members} myMember={myMember} balances={balances}
        isOpen={settleModal.isOpen} onClose={settleModal.onClose} onSaved={load} />

      <RenameGroupModal group={group} isOpen={renameModal.isOpen}
        onClose={renameModal.onClose} onSaved={load} />

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
    const addr = email.trim()
    if (!addr) return
    setBusy(true)
    try {
      // First try to invite an existing Budge user (in-app request).
      await inviteExistingUser(group.id, addr)
      toast({ title: `Request sent to ${addr}`, description: 'They’ll see it in Budge.', status: 'success' })
      onClose(); setEmail('')
    } catch (err) {
      if (err.message === 'no_account') {
        // No account yet — send an emailable join link.
        try {
          const { token, url } = await createInvite(group.id, { email: addr })
          try {
            await emailInvite({ to: addr, token })
            toast({ title: `Invite emailed to ${addr}`, status: 'success' })
          } catch (mailErr) {
            await navigator.clipboard.writeText(url)
            toast({ title: 'Couldn’t send the email — link copied instead',
              description: mailErr.message, status: 'warning', duration: 8000 })
          }
          onClose(); setEmail('')
        } catch (e2) {
          toast({ title: e2.message, status: 'error' })
        }
      } else {
        toast({ title: err.message, status: 'error' })
      }
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

// Settle-up is always framed from the current user: they are one side of every
// settlement (payer or receiver), and pick the other member. Prevents
// arbitrary member-to-member entries.
function SettleUpModal({ group, members, myMember, balances, isOpen, onClose, onSaved }) {
  const toast = useToast()
  const others = members.filter((m) => m.id !== myMember?.id)
  const [direction, setDirection] = useState('out') // 'out' = I paid, 'in' = they paid me
  const [otherId, setOtherId] = useState(others[0]?.id ?? '')
  const [amount, setAmount] = useState('')
  const [settledAt, setSettledAt] = useState(() => new Date().toISOString().slice(0, 10))
  const [busy, setBusy] = useState(false)

  const otherNet = balances?.get(otherId) ?? 0
  const otherName = others.find((m) => m.id === otherId)?.display_name ?? ''

  async function submit(e) {
    e.preventDefault()
    if (!otherId) return toast({ title: 'Pick a person', status: 'warning' })
    if (!amount || Number(amount) <= 0) return toast({ title: 'Enter an amount', status: 'warning' })
    const from = direction === 'out' ? myMember.id : otherId
    const to = direction === 'out' ? otherId : myMember.id
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
        <ModalHeader>Settle up</ModalHeader>
        <ModalBody>
          {others.length === 0 ? (
            <Text color="text.muted">Add another member first.</Text>
          ) : (
            <Stack spacing={4}>
              <HStack spacing={2}>
                <Button flex="1" variant={direction === 'out' ? 'solid' : 'outline'}
                  colorScheme={direction === 'out' ? 'brand' : 'gray'}
                  onClick={() => setDirection('out')}>I paid</Button>
                <Button flex="1" variant={direction === 'in' ? 'solid' : 'outline'}
                  colorScheme={direction === 'in' ? 'brand' : 'gray'}
                  onClick={() => setDirection('in')}>I received</Button>
              </HStack>

              <FormControl isRequired>
                <FormLabel>{direction === 'out' ? 'Paid to' : 'Received from'}</FormLabel>
                <Select value={otherId} onChange={(e) => setOtherId(e.target.value)}>
                  {others.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}
                </Select>
                {otherId && (
                  <Text fontSize="xs" color="text.muted" mt={1}>
                    {otherNet === 0 ? `${otherName} is settled up`
                      : otherNet > 0 ? `${otherName} is owed ${formatMoney(otherNet, group.currency)} overall`
                      : `${otherName} owes ${formatMoney(-otherNet, group.currency)} overall`}
                  </Text>
                )}
              </FormControl>

              <HStack align="end" justify="center" color="text.muted" fontSize="sm">
                <Text fontWeight="600" color="text.primary">
                  {direction === 'out' ? 'You' : otherName || '—'}
                </Text>
                <ArrowRight size={16} />
                <Text fontWeight="600" color="text.primary">
                  {direction === 'out' ? otherName || '—' : 'You'}
                </Text>
              </HStack>

              <HStack>
                <FormControl isRequired>
                  <FormLabel>Amount ({group.currency})</FormLabel>
                  <MoneyInput value={amount} onChange={setAmount} />
                </FormControl>
                <FormControl maxW="160px">
                  <FormLabel>Date</FormLabel>
                  <Input type="date" value={settledAt} onChange={(e) => setSettledAt(e.target.value)} />
                </FormControl>
              </HStack>
            </Stack>
          )}
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={busy} isDisabled={others.length === 0}>Record</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}

function RenameGroupModal({ group, isOpen, onClose, onSaved }) {
  const toast = useToast()
  const [name, setName] = useState(group.name)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (isOpen) setName(group.name) }, [isOpen, group.name])

  async function submit(e) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    try {
      await renameGroup(group.id, name.trim())
      toast({ title: 'Group renamed', status: 'success' })
      onSaved?.(); onClose()
    } catch (e) { toast({ title: e.message, status: 'error' }) }
    finally { setBusy(false) }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered>
      <ModalOverlay />
      <ModalContent as="form" onSubmit={submit} mx={4}>
        <ModalHeader>Rename group</ModalHeader>
        <ModalBody>
          <FormControl isRequired>
            <FormLabel>Group name</FormLabel>
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          </FormControl>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={busy}>Save</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
