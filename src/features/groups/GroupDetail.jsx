import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Stack, Text, Center, Spinner, useToast, useDisclosure } from '@chakra-ui/react'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { useLiveQuery } from '../../shared/lib/db.js'
import { useAsyncSubmit } from '../../shared/lib/useAsyncSubmit.js'
import QueryError from '../../shared/ui/QueryError.jsx'
import {
  getGroup, createInviteLink, removeMember, deleteGroup, listAuditLog, downloadGroupReport,
} from './groups.js'
import { commentCounts } from './comments.js'
import { groupTotal, groupSummaryText } from './groupFormat.js'
import { formatMoney } from '../../shared/lib/currency.js'
import GroupHeader from './GroupHeader.jsx'
import GroupBalances from './GroupBalances.jsx'
import GroupHistory from './GroupHistory.jsx'
import MembersSheet from './MembersSheet.jsx'
import GroupExpenseForm from './GroupExpenseForm.jsx'
import CommentThread from './CommentThread.jsx'
import {
  DeleteGroupModal, InviteEmailModal, SettleUpModal, RenameGroupModal, LeaveGroupModal,
  RemoveMemberModal,
} from './GroupModals.jsx'

export default function GroupDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const toast = useToast()
  // Live: when anyone in the group adds/edits expenses, settles up, or
  // joins/leaves, refetch — no manual refresh. The hook also catches up after
  // reconnects and when the tab becomes visible again.
  const { data: bundle, loading, error, reload: load } = useLiveQuery(async () => {
    const [group, auditLog] = await Promise.all([getGroup(id), listAuditLog(id)])
    return { group, auditLog }
  }, {
    key: `group:${id}`,
    specs: [
      { table: 'group_expenses', filter: `group_id=eq.${id}` },
      { table: 'settlements', filter: `group_id=eq.${id}` },
      { table: 'group_members', filter: `group_id=eq.${id}` },
    ],
    deps: [id],
  })
  // Comment counts live apart: a new comment refetches only the counts, not
  // the whole group.
  const { data: counts, reload: refreshCounts } = useLiveQuery(() => commentCounts(id), {
    key: `group-comments:${id}`,
    specs: [{ table: 'group_comments', filter: `group_id=eq.${id}` }],
    deps: [id],
    initial: new Map(),
  })
  const data = bundle?.group ?? null
  const auditLog = bundle?.auditLog ?? []
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
  const { busy: reportBusy, run: runReport } = useAsyncSubmit()
  const [thread, setThread] = useState(null) // { type, id, label }

  function openAdd() { setEditingExpense(null); expenseModal.onOpen() }
  function openEdit(exp) { setEditingExpense(exp); expenseModal.onOpen() }
  function closeExpense() { expenseModal.onClose(); setEditingExpense(null) }

  async function downloadReport() {
    await runReport(() => downloadGroupReport(id, data?.group?.name || 'group'),
      { errorTitle: 'Couldn’t generate the report' })
  }

  const balances = data?.balances ?? new Map()
  const myMember = data?.members.find((m) => m.user_id === user.id)

  // "Share summary": the system share sheet where there is one (phones),
  // else the clipboard. Text only — total and who owes whom.
  async function shareSummary() {
    const { group, members, expenses } = data
    const text = groupSummaryText({
      name: group.name, total: groupTotal(expenses, group.currency), balances, members,
      format: (m) => formatMoney(m, group.currency),
    })
    if (navigator.share) {
      try {
        await navigator.share({ title: group.name, text })
        return
      } catch (e) {
        if (e?.name === 'AbortError') return // the user closed the share sheet
      }
    }
    try {
      await navigator.clipboard.writeText(text)
      toast({ title: 'Summary copied', description: 'Paste it into your group chat.', status: 'success' })
    } catch {
      toast({ title: 'Couldn’t share the summary', status: 'error' })
    }
  }

  async function copyInvite() {
    try {
      const url = await createInviteLink(id)
      await navigator.clipboard.writeText(url)
      toast({ title: 'Invite link copied', description: 'Paste it in a chat to invite friends.', status: 'success' })
    } catch (e) {
      toast({ title: 'Could not create invite', description: e.message, status: 'error' })
    }
  }

  async function doLeave(silent) {
    setActionBusy(true)
    try {
      await removeMember(myMember.id, silent)
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

  if (error) return <QueryError error={error} onRetry={load} what="this group" py={20} />
  if (loading) return <Center py={20}><Spinner color="brand.500" /></Center>
  if (!data) return <Text color="text.muted">Group not found.</Text>

  const { group, members, expenses, settlements } = data
  const isOwner = group.owner_id === user.id

  return (
    <Stack spacing={5}>
      <GroupHeader group={group} members={members} myUserId={user.id} isOwner={isOwner}
        total={formatMoney(groupTotal(expenses, group.currency), group.currency)}
        onPhotoChanged={load} onAdd={openAdd} onMembers={membersSheet.onOpen}
        onReport={downloadReport} onShare={shareSummary} onRename={renameModal.onOpen}
        onLeave={myMember ? leaveModal.onOpen : undefined} onDelete={deleteModal.onOpen} />

      <GroupBalances group={group} members={members} balances={balances} myMember={myMember}
        myUserId={user.id} onSettle={settleModal.onOpen} />

      <GroupHistory group={group} members={members} expenses={expenses} settlements={settlements}
        auditLog={auditLog} counts={counts} myMember={myMember} myUserId={user.id} isOwner={isOwner}
        onEdit={openEdit} onThread={setThread} reportBusy={reportBusy} onReport={downloadReport} />

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

      <LeaveGroupModal group={group} isOwner={isOwner} isOpen={leaveModal.isOpen}
        onClose={leaveModal.onClose} busy={actionBusy} onConfirm={doLeave} />

      {/* Delete confirm (type-to-confirm) */}
      <DeleteGroupModal group={group} isOpen={deleteModal.isOpen} onClose={deleteModal.onClose}
        busy={actionBusy} onConfirm={doDelete} />

      <RemoveMemberModal member={removeTarget} onClose={() => setRemoveTarget(null)}
        busy={actionBusy} onConfirm={doRemove} />
    </Stack>
  )
}
