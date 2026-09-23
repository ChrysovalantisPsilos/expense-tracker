import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Stack, HStack, Text, Spacer, Button, Center,
  Spinner, Flex, IconButton, useToast,
  useDisclosure, Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody,
  ModalFooter, Checkbox,
} from '@chakra-ui/react'
import { ArrowRightLeft, HandCoins, FileDown, MessageSquare, Receipt } from 'lucide-react'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { useLiveRefetch } from '../../shared/lib/realtime.js'
import {
  getGroup, createInviteLink, removeMember, deleteGroup, listAuditLog, downloadGroupReport,
} from './groups.js'
import { commentCounts } from './comments.js'
import {
  memberName, splitLabel, settlePlan, pluralise, paidByLabel, groupTotal,
  memberBalances, balanceHighlight, isEveryoneEqualSplit,
} from './groupFormat.js'
import { formatMoney } from '../../shared/lib/currency.js'
import { shortDate, shortDateTime } from '../../shared/lib/dates.js'
import SegmentedControl from '../../shared/ui/SegmentedControl.jsx'
import Panel from '../../shared/ui/kit/Panel.jsx'
import Figure from '../../shared/ui/kit/Figure.jsx'
import SectionLabel from '../../shared/ui/kit/SectionLabel.jsx'
import HighlightPill from '../../shared/ui/kit/HighlightPill.jsx'
import ItemRow from '../../shared/ui/kit/ItemRow.jsx'
import TransferRow from '../../shared/ui/kit/TransferRow.jsx'
import { BalanceGrid, BalanceTile } from '../../shared/ui/kit/Balances.jsx'
import { signedAmount } from '../../shared/ui/kit/kitMath.js'
import GroupHeader from './GroupHeader.jsx'
import MembersSheet from './MembersSheet.jsx'
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
  const membersSheet = useDisclosure()
  const [removeTarget, setRemoveTarget] = useState(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [editingExpense, setEditingExpense] = useState(null)
  const [auditLog, setAuditLog] = useState([])
  const [reportBusy, setReportBusy] = useState(false)
  const [counts, setCounts] = useState(new Map())
  const [thread, setThread] = useState(null) // { type, id, label }
  const [tab, setTab] = useState('expenses') // expenses | settlements | activity
  const [leaveSilently, setLeaveSilently] = useState(false)

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
  const money = (minor) => formatMoney(minor, cur)
  const plan = settlePlan(balances, members, myMember?.id)
  const highlight = balanceHighlight(plan)
  const memberNets = memberBalances(balances, members, user.id)
  const avatarOf = (mid) => members.find((m) => m.id === mid)?.avatar_url
  const isOwner = group.owner_id === user.id
  const mine = signedAmount(myNet, money)

  return (
    <Stack spacing={5}>
      <GroupHeader group={group} members={members} myUserId={user.id} isOwner={isOwner}
        total={money(groupTotal(expenses, cur))}
        onPhotoChanged={load} onAdd={openAdd} onMembers={membersSheet.onOpen}
        onReport={downloadReport} onRename={renameModal.onOpen}
        onLeave={myMember ? leaveModal.onOpen : undefined} onDelete={deleteModal.onOpen} />

      {/* Your balance: your net, everyone's net, and the line that matters most */}
      <Panel>
        <HStack align="center" spacing={3}>
          <Figure label="Your balance" value={mine.text} tone={mine.tone} size="xl" flex="1" />
          <Button size="sm" variant="outline" leftIcon={<HandCoins size={16} />} flexShrink={0}
            onClick={settleModal.onOpen}>Settle up</Button>
        </HStack>
        {memberNets.length > 1 && (
          <>
            <SectionLabel mt={4} mb={2}>Balances</SectionLabel>
            <BalanceGrid>
              {memberNets.map((b) => {
                const { text, tone } = signedAmount(b.net, money)
                return <BalanceTile key={b.id} label={b.label} value={text} tone={tone} />
              })}
            </BalanceGrid>
          </>
        )}
        <HighlightPill mt={3} amount={highlight ? money(highlight.amount) : undefined}
          amountTone={highlight?.tone}>
          {highlight ? highlight.text : 'You’re all settled up'}
        </HighlightPill>
      </Panel>

      {/* Who owes whom: the whole group's settle-up plan (fewest payments) */}
      {plan.length > 0 && (
        <Panel icon={ArrowRightLeft} title="Who owes whom"
          subtitle={`${pluralise(plan.length, 'payment')} to settle everyone up`}>
          <Stack spacing={2}>
            {plan.map((t) => (
              <TransferRow key={`${t.from}-${t.to}`} amount={money(t.amount)} amountTone={t.tone}
                from={{ name: t.fromName, src: avatarOf(t.from), highlight: t.from === myMember?.id }}
                to={{ name: t.toName, src: avatarOf(t.to), highlight: t.to === myMember?.id }} />
            ))}
          </Stack>
        </Panel>
      )}

      {/* History — tabbed (Expenses / Settlements / Activity) */}
      <Panel>
        <HStack mb={3}>
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
          <Stack spacing={0}>
            {expenses.map((e) => {
              const canEdit = e.created_by === user.id || isOwner
              const label = e.description || 'Expense'
              return (
                <ItemRow key={e.id} icon={Receipt} title={label}
                  meta={<RowMeta parts={[paidByLabel(members, e.paid_by, myMember?.id), shortDate(e.spent_at),
                    { text: splitLabel(e), phone: !isEveryoneEqualSplit(e, members) }]} />}
                  amount={formatMoney(e.amount_minor, e.currency)}
                  onClick={canEdit ? () => openEdit(e) : undefined}
                  trailing={<CommentButton count={counts.get(e.id)}
                    onClick={() => setThread({ type: 'expense', id: e.id, label })} />} />
              )
            })}
          </Stack>
        ))}

        {tab === 'settlements' && (settlements.length === 0 ? (
          <Text color="text.muted" fontSize="sm">No settlements yet.</Text>
        ) : (
          <Stack spacing={0}>
            {settlements.map((s) => {
              const label = `${nameOf(s.from_member)} → ${nameOf(s.to_member)}`
              return (
                <ItemRow key={s.id} icon={HandCoins} title={label} meta={shortDate(s.settled_at)}
                  amount={formatMoney(s.amount_minor, s.currency)}
                  trailing={<CommentButton count={counts.get(s.id)}
                    onClick={() => setThread({ type: 'settlement', id: s.id, label })} />} />
              )
            })}
          </Stack>
        ))}

        {tab === 'activity' && (auditLog.length === 0 ? (
          <Text fontSize="sm" color="text.muted">No activity yet.</Text>
        ) : (
          <Stack spacing={0}>
            {auditLog.slice(0, 25).map((a) => (
              <HStack key={a.id} py={2} align="start" spacing={3}>
                <Stack spacing={0} flex="1" minW={0}>
                  <Text fontSize="sm">{a.summary}</Text>
                  <Text fontSize="xs" color="text.muted">{shortDateTime(a.created_at)}</Text>
                </Stack>
                {a.amount_minor != null && (
                  <Text fontSize="sm" fontWeight="700" whiteSpace="nowrap">
                    {formatMoney(a.amount_minor, a.currency || cur)}
                  </Text>
                )}
              </HStack>
            ))}
          </Stack>
        ))}
      </Panel>

      <GroupExpenseForm key={editingExpense?.id || 'new'} group={group} members={members}
        defaultPayer={myMember?.id} expense={editingExpense}
        isOpen={expenseModal.isOpen} onClose={closeExpense} onSaved={load} />

      <SettleUpModal group={group} members={members} myMember={myMember} balances={balances}
        isOpen={settleModal.isOpen} onClose={settleModal.onClose} onSaved={load} />

      <CommentThread group={group} target={thread} myMember={myMember}
        isOpen={!!thread} onClose={() => setThread(null)} onChanged={refreshCounts} />

      <RenameGroupModal group={group} isOpen={renameModal.isOpen}
        onClose={renameModal.onClose} onSaved={load} />

      <MembersSheet members={members} myUserId={user.id} isOwner={isOwner}
        isOpen={membersSheet.isOpen} onClose={membersSheet.onClose}
        onInviteEmail={inviteModal.onOpen} onInviteLink={copyInvite} onRemove={setRemoveTarget}
        onLeave={myMember ? () => { membersSheet.onClose(); leaveModal.onOpen() } : undefined} />

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

// A row's muted meta line that wraps between its parts on narrow screens
// ("Paid by You · 8 Sep · split 4 ways"). A part is a string, or
// { text, phone: false } to hide it below `sm`. Each separator stays at the
// end of the part before it (so a wrapped line never starts with one) and
// shows only where the part after it does.
function RowMeta({ parts }) {
  const list = parts.map((p) => (typeof p === 'string' ? { text: p, phone: true } : p))
  const shown = (p) => (p.phone ? undefined : { base: 'none', sm: 'inline' })
  return (
    <Flex wrap="wrap" columnGap={1} fontSize="xs" color="text.muted">
      {list.map((p, i) => (
        <Text key={i} display={shown(p)} noOfLines={i ? undefined : 1}
          whiteSpace={i ? 'nowrap' : undefined} maxW="100%">
          {p.text}
          {i < list.length - 1 && <Text as="span" display={shown(list[i + 1])}> ·</Text>}
        </Text>
      ))}
    </Flex>
  )
}

// A row's trailing comment icon with its count, in a fixed-width slot so the
// amounts of a list line up.
function CommentButton({ count, onClick }) {
  return (
    <HStack spacing={0.5} w="40px" flexShrink={0}>
      <IconButton aria-label="Comments" size="xs" variant="ghost" color="text.muted"
        icon={<MessageSquare size={15} />} onClick={onClick} />
      {count > 0 && <Text fontSize="xs" color="text.muted">{count}</Text>}
    </HStack>
  )
}
