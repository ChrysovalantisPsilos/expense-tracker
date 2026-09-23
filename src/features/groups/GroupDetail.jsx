import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Stack, Card, CardBody, HStack, Text, Spacer, Button, Center, Box,
  Spinner, Flex, Badge, IconButton, Divider, List, ListItem, useToast,
  useDisclosure, Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody,
  ModalFooter, Avatar, Checkbox,
  Menu, MenuButton, MenuList, MenuItem,
} from '@chakra-ui/react'
import {
  ArrowLeft, ArrowRight, ArrowRightLeft, Plus, Link2, Users, HandCoins, Mail,
  MoreVertical, LogOut, Trash2, UserMinus, Pencil, Camera, FileDown, MessageSquare,
} from 'lucide-react'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { useLiveRefetch } from '../../shared/lib/realtime.js'
import {
  getGroup, createInviteLink, removeMember, deleteGroup,
  uploadGroupImage, listAuditLog, downloadGroupReport,
} from './groups.js'
import { commentCounts } from './comments.js'
import { memberName, describeBalance, splitLabel, settlePlan, pluralise } from './groupFormat.js'
import { formatMoney } from '../../shared/lib/currency.js'
import { shortDate, shortDateTime } from '../../shared/lib/dates.js'
import PageHeader, { PageAction } from '../../shared/ui/PageHeader.jsx'
import CardHeader from '../../shared/ui/CardHeader.jsx'
import RowAmount from '../../shared/ui/RowAmount.jsx'
import SegmentedControl from '../../shared/ui/SegmentedControl.jsx'
import GroupExpenseForm from './GroupExpenseForm.jsx'
import CommentThread from './CommentThread.jsx'
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
  const [counts, setCounts] = useState(new Map())
  const [thread, setThread] = useState(null) // { type, id, label }
  const [tab, setTab] = useState('expenses') // expenses | settlements | activity
  const [leaveSilently, setLeaveSilently] = useState(false)
  const imgRef = useRef(null)

  function openAdd() { setEditingExpense(null); expenseModal.onOpen() }
  function openEdit(exp) { setEditingExpense(exp); expenseModal.onOpen() }
  function closeExpense() { expenseModal.onClose(); setEditingExpense(null) }

  async function load() {
    try {
      const [g, al, cc] = await Promise.all([getGroup(id), listAuditLog(id), commentCounts(id)])
      setData(g)
      setAuditLog(al)
      setCounts(cc)
    }
    catch (e) { toast({ title: e.message, status: 'error' }) }
    finally { setLoading(false) }
  }

  async function refreshCounts() {
    try { setCounts(await commentCounts(id)) } catch { /* ignore */ }
  }

  async function downloadReport() {
    setReportBusy(true)
    try {
      await downloadGroupReport(id, data?.group?.name || 'group')
    } catch (e) { toast({ title: 'Couldn’t generate the report', description: e.message, status: 'error' }) }
    finally { setReportBusy(false) }
  }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [id])

  // Live updates: when anyone in the group adds/edits expenses, settles up,
  // joins/leaves, or comments, refetch — no manual refresh. The hook also
  // catches up after reconnects and when the tab becomes visible again.
  useLiveRefetch(`group:${id}`, [
    { table: 'group_expenses', filter: `group_id=eq.${id}` },
    { table: 'settlements', filter: `group_id=eq.${id}` },
    { table: 'group_members', filter: `group_id=eq.${id}` },
    { table: 'group_comments', filter: `group_id=eq.${id}` },
  ], () => { load(); refreshCounts() })

  const balances = data?.balances ?? new Map()
  const nameOf = (mid) => memberName(data?.members, mid)
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

  async function doLeave() {
    setActionBusy(true)
    try {
      await removeMember(myMember.id, leaveSilently)
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
  const plan = settlePlan(balances, members, myMember?.id)
  const isOwner = group.owner_id === user.id

  return (
    <Stack spacing={5}>
      <PageHeader eyebrow="Group" title={group.name} leading={<>
        <IconButton aria-label="Back" variant="ghost" size="sm" ml={-2} flexShrink={0}
          icon={<ArrowLeft size={18} />} onClick={() => navigate('/groups')} />
        <Box position="relative" flexShrink={0}>
          <Avatar borderRadius="lg" size="md" name={group.name} src={group.image_url}
            bg="bg.subtle" color="accent.fg" />
          {isOwner && (
            <>
              <IconButton aria-label="Change group photo" icon={<Camera size={12} />}
                size="xs" borderRadius="full" position="absolute" bottom="-6px" right="-6px"
                isLoading={uploadingImg} onClick={() => imgRef.current?.click()} />
              <input ref={imgRef} type="file" accept="image/*" hidden onChange={onGroupImage} />
            </>
          )}
        </Box>
      </>} action={<>
        <PageAction icon={<Plus size={16} />} label="Add expense" onClick={openAdd} />
        <Menu>
          <MenuButton as={IconButton} aria-label="Group options" size="sm" mr={-2}
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
              <MenuItem icon={<Trash2 size={16} />} color="status.negative" onClick={deleteModal.onOpen}>
                Delete group
              </MenuItem>
            )}
          </MenuList>
        </Menu>
      </>} />

      {/* Your balance summary */}
      <Card>
        <CardBody>
          <HStack>
            <Flex boxSize="44px" align="center" justify="center" borderRadius="xl"
              bg="bg.subtle" color="accent.fg"><HandCoins size={22} /></Flex>
            <Stack spacing={0}>
              <Text fontSize="sm" color="text.muted">Your balance</Text>
              <Text fontWeight="700" fontSize="lg"
                color={myNet > 0 ? 'status.positive' : myNet < 0 ? 'status.negative' : 'text.primary'}>
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

      {/* Who owes whom: the whole group's settle-up plan (fewest payments) */}
      {plan.length > 0 && (
        <Card><CardBody>
          <CardHeader icon={ArrowRightLeft} title="Who owes whom"
            subtitle={`${pluralise(plan.length, 'payment')} to settle everyone up`} />
          <Stack spacing={2}>
            {plan.map((t) => (
              <HStack key={`${t.from}-${t.to}`} spacing={2} px={3} py={2.5} borderRadius="lg"
                bg={t.mine ? 'bg.subtle' : 'transparent'}
                borderWidth={t.mine ? 0 : '1px'} borderColor="border.default">
                <Text fontSize="sm" fontWeight="600" noOfLines={1} minW={0}>{t.fromName}</Text>
                <Box color="text.muted" flexShrink={0}><ArrowRight size={14} /></Box>
                <Text fontSize="sm" fontWeight="600" noOfLines={1} minW={0} flex="1">{t.toName}</Text>
                <Text fontSize="sm" fontWeight="700" whiteSpace="nowrap"
                  color={t.to === myMember?.id ? 'status.positive'
                    : t.from === myMember?.id ? 'status.negative' : 'text.primary'}>
                  {formatMoney(t.amount, cur)}
                </Text>
              </HStack>
            ))}
          </Stack>
        </CardBody></Card>
      )}

      {/* Members */}
      <Card><CardBody>
        <CardHeader icon={Users} title="Members" mb={3} action={<>
          <Button size="xs" variant="ghost" leftIcon={<Mail size={14} />}
            onClick={inviteModal.onOpen}>Email</Button>
          <Button size="xs" variant="ghost" leftIcon={<Link2 size={14} />}
            onClick={copyInvite}>Link</Button>
        </>} />
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
                    <Text fontSize="sm" color={net > 0 ? 'status.positive' : 'status.negative'}>
                      {describeBalance(net, cur)}
                    </Text>
                  )}
                  {isOwner && !isMe && (
                    <IconButton aria-label={`Remove ${m.display_name}`} size="xs" variant="ghost"
                      color="status.negative" icon={<UserMinus size={14} />}
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

      {/* History — tabbed (Expenses / Settlements / Activity) */}
      <Card><CardBody>
        <HStack mb={4}>
          <SegmentedControl label="History" value={tab} onChange={setTab}
            options={[['expenses', 'Expenses'], ['settlements', 'Settlements'], ['activity', 'Activity']]} />
          <Spacer />
          {tab === 'activity' && (
            <Button size="xs" variant="ghost" leftIcon={<FileDown size={14} />}
              isLoading={reportBusy} onClick={downloadReport}>PDF</Button>
          )}
        </HStack>

        {tab === 'expenses' && (expenses.length === 0 ? (
          <Text color="text.muted" fontSize="sm">No shared expenses yet.</Text>
        ) : (
          <List spacing={0}>
            {expenses.map((e, i) => {
              const canEdit = e.created_by === user.id || isOwner
              return (
              <ListItem key={e.id}>
                {i > 0 && <Divider />}
                <HStack py={3} spacing={2} align="center"
                  cursor={canEdit ? 'pointer' : 'default'}
                  onClick={canEdit ? () => openEdit(e) : undefined}
                  _hover={canEdit ? { opacity: 0.75 } : undefined} transition="opacity 0.1s">
                  <Stack spacing={0.5} flex="1" minW={0}>
                    <Text fontWeight="600" noOfLines={1}>{e.description || 'Expense'}</Text>
                    <Flex wrap="wrap" columnGap={1.5} fontSize="xs" color="text.muted">
                      <Text noOfLines={1} maxW="100%">{nameOf(e.paid_by)} paid</Text>
                      <Text whiteSpace="nowrap">· {shortDate(e.spent_at)}</Text>
                      <Text whiteSpace="nowrap">· {splitLabel(e)}</Text>
                    </Flex>
                  </Stack>
                  <HStack spacing={0.5} flexShrink={0}>
                    <IconButton aria-label="Comments" size="xs" variant="ghost" color="text.muted"
                      icon={<MessageSquare size={15} />}
                      onClick={(ev) => { ev.stopPropagation(); setThread({ type: 'expense', id: e.id, label: e.description || 'Expense' }) }} />
                    {counts.get(e.id) > 0 && <Text fontSize="xs" color="text.muted">{counts.get(e.id)}</Text>}
                  </HStack>
                  <RowAmount>{formatMoney(e.amount_minor, e.currency)}</RowAmount>
                </HStack>
              </ListItem>
              )
            })}
          </List>
        ))}

        {tab === 'settlements' && (settlements.length === 0 ? (
          <Text color="text.muted" fontSize="sm">No settlements yet.</Text>
        ) : (
          <List spacing={0}>
            {settlements.map((s, i) => (
              <ListItem key={s.id}>
                {i > 0 && <Divider />}
                <HStack py={2.5} fontSize="sm" spacing={3}>
                  <Stack spacing={0} flex="1" minW={0}>
                    <Text noOfLines={1}>{nameOf(s.from_member)} → {nameOf(s.to_member)}</Text>
                    <Text fontSize="xs" color="text.muted">{shortDate(s.settled_at)}</Text>
                  </Stack>
                  <HStack spacing={0.5}>
                    <IconButton aria-label="Comments" size="xs" variant="ghost" color="text.muted"
                      icon={<MessageSquare size={15} />}
                      onClick={() => setThread({ type: 'settlement', id: s.id, label: `${nameOf(s.from_member)} → ${nameOf(s.to_member)}` })} />
                    {counts.get(s.id) > 0 && <Text fontSize="xs" color="text.muted">{counts.get(s.id)}</Text>}
                  </HStack>
                  <RowAmount>{formatMoney(s.amount_minor, s.currency)}</RowAmount>
                </HStack>
              </ListItem>
            ))}
          </List>
        ))}

        {tab === 'activity' && (auditLog.length === 0 ? (
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
                      {shortDateTime(a.created_at)}
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
        ))}
      </CardBody></Card>

      <GroupExpenseForm key={editingExpense?.id || 'new'} group={group} members={members}
        defaultPayer={myMember?.id} expense={editingExpense}
        isOpen={expenseModal.isOpen} onClose={closeExpense} onSaved={load} />

      <SettleUpModal group={group} members={members} myMember={myMember} balances={balances}
        isOpen={settleModal.isOpen} onClose={settleModal.onClose} onSaved={load} />

      <CommentThread group={group} target={thread} myMember={myMember}
        isOpen={!!thread} onClose={() => setThread(null)} onChanged={refreshCounts} />

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
            <Stack spacing={4}>
              <Text color="text.muted">
                You can only leave once your balance is settled. Your past expenses
                stay in the group for everyone else.
                {isOwner && ' As the owner, ownership passes to another member.'}
              </Text>
              <Checkbox isChecked={leaveSilently}
                onChange={(e) => setLeaveSilently(e.target.checked)}>
                <Text fontSize="sm">Leave silently — don’t notify the group</Text>
              </Checkbox>
            </Stack>
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
