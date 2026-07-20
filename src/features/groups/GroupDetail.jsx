import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Heading, Stack, Card, CardBody, HStack, Text, Spacer, Button, Center, Box,
  Spinner, Flex, Badge, IconButton, Divider, List, ListItem, useToast,
  useDisclosure, Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody,
  ModalFooter, Avatar,
  Menu, MenuButton, MenuList, MenuItem,
} from '@chakra-ui/react'
import {
  ArrowLeft, Plus, Link2, Users, HandCoins, Paperclip, Mail,
  MoreVertical, LogOut, Trash2, UserMinus, Pencil, Camera, FileDown,
} from 'lucide-react'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import {
  getGroup, createInviteLink, removeMember, deleteGroup,
  uploadGroupImage, listAuditLog, downloadGroupReport,
} from './groups.js'
import { formatMoney } from '../../shared/lib/currency.js'
import { receiptUrl } from '../transactions/receipts.js'
import GroupExpenseForm from './GroupExpenseForm.jsx'
import {
  DeleteGroupModal, InviteEmailModal, SettleUpModal, RenameGroupModal,
} from './GroupModals.jsx'

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
  const [auditLog, setAuditLog] = useState([])
  const [reportBusy, setReportBusy] = useState(false)
  const imgRef = useRef(null)

  function openAdd() { setEditingExpense(null); expenseModal.onOpen() }
  function openEdit(exp) { setEditingExpense(exp); expenseModal.onOpen() }
  function closeExpense() { expenseModal.onClose(); setEditingExpense(null) }

  async function load() {
    try {
      const [g, al] = await Promise.all([getGroup(id), listAuditLog(id)])
      setData(g)
      setAuditLog(al)
    }
    catch (e) { toast({ title: e.message, status: 'error' }) }
    finally { setLoading(false) }
  }

  async function downloadReport() {
    setReportBusy(true)
    try {
      await downloadGroupReport(id, data?.group?.name || 'group')
    } catch (e) { toast({ title: 'Couldn’t generate the report', description: e.message, status: 'error' }) }
    finally { setReportBusy(false) }
  }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [id])

  const balances = data?.balances ?? new Map()
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
            <MenuItem icon={<FileDown size={16} />} onClick={downloadReport}>
              Download statement (PDF)
            </MenuItem>
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
                      {nameOf(e.paid_by)} paid · {e.spent_at} ·{' '}
                      {e.split_type && e.split_type !== 'equal'
                        ? `custom split · ${e.expense_splits?.length ?? 0} people`
                        : `split ${e.expense_splits?.length ?? 0} ways`}
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

      {/* Activity / audit trail */}
      <Card><CardBody>
        <HStack mb={3}>
          <Heading size="sm">Activity</Heading>
          <Spacer />
          <Button size="xs" variant="ghost" leftIcon={<FileDown size={14} />}
            isLoading={reportBusy} onClick={downloadReport}>PDF</Button>
        </HStack>
        {auditLog.length === 0 ? (
          <Text fontSize="sm" color="text.muted">No activity yet.</Text>
        ) : (
          <List spacing={0}>
            {auditLog.slice(0, 25).map((a, i) => (
              <ListItem key={a.id}>
                {i > 0 && <Divider />}
                <HStack py={2} align="start">
                  <Stack spacing={0} flex="1">
                    <Text fontSize="sm">{a.summary}</Text>
                    <Text fontSize="xs" color="text.muted">
                      {new Date(a.created_at).toLocaleString()}
                    </Text>
                  </Stack>
                  {a.amount_minor != null && (
                    <Text fontSize="sm" fontWeight="600">
                      {formatMoney(a.amount_minor, a.currency || cur)}
                    </Text>
                  )}
                </HStack>
              </ListItem>
            ))}
          </List>
        )}
      </CardBody></Card>

      <GroupExpenseForm key={editingExpense?.id || 'new'} group={group} members={members}
        defaultPayer={myMember?.id} expense={editingExpense}
        isOpen={expenseModal.isOpen} onClose={closeExpense} onSaved={load} />

      <SettleUpModal group={group} members={members} myMember={myMember} balances={balances}
        isOpen={settleModal.isOpen} onClose={settleModal.onClose} onSaved={load} />

      <RenameGroupModal group={group} isOpen={renameModal.isOpen}
        onClose={renameModal.onClose} onSaved={load} />

      <InviteEmailModal group={group}
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
