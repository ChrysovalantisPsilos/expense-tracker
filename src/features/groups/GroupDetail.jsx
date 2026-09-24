import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Stack, Text, useToast, useDisclosure } from '@chakra-ui/react'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { useLiveQuery } from '../../shared/lib/db.js'
import { useAsyncSubmit } from '../../shared/lib/useAsyncSubmit.js'
import QueryError from '../../shared/ui/QueryError.jsx'
import PageHeader from '../../shared/ui/PageHeader.jsx'
import BackButton from '../../shared/ui/BackButton.jsx'
import Panel from '../../shared/ui/kit/Panel.jsx'
import { useGroup, removeMember, deleteGroup, downloadGroupReport } from './groups.js'
import { commentCounts } from './comments.js'
import { groupTotal, groupSummaryText } from './groupFormat.js'
import { formatMoney } from '../../shared/lib/currency.js'
import GroupHeader from './GroupHeader.jsx'
import GroupBalances from './GroupBalances.jsx'
import GroupHistory from './GroupHistory.jsx'
import { GroupDetailSkeleton } from './GroupSkeletons.jsx'
import { DeleteGroupModal, LeaveGroupModal } from './GroupModals.jsx'
import { userMessage } from '../../shared/lib/errors.js'
import { BusyNote } from '../../shared/ui/RingLoader.jsx'

// A group's page: its header, balances and history. Adding or editing an
// expense, settling up, comments, members and editing the group are pages of
// their own under /groups/:id/…; leaving and deleting are confirmed here.
export default function GroupDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const toast = useToast()
  // Live: when anyone in the group adds/edits expenses, settles up, or
  // joins/leaves, refetch — no manual refresh (useGroup).
  const { data, loading, error, reload: load } = useGroup(id, { activity: true })
  // Comment counts live apart: a new comment refetches only the counts, not
  // the whole group.
  const { data: counts } = useLiveQuery(() => commentCounts(id), {
    key: `group-comments:${id}`,
    specs: [{ table: 'group_comments', filter: `group_id=eq.${id}` }],
    deps: [id],
    initial: new Map(),
  })
  const leaveModal = useDisclosure()
  const deleteModal = useDisclosure()
  const [actionBusy, setActionBusy] = useState(false)
  const { busy: reportBusy, run: runReport } = useAsyncSubmit()
  const to = (sub) => () => navigate(`/groups/${id}/${sub}`)

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

  async function doLeave(silent) {
    setActionBusy(true)
    try {
      await removeMember(myMember.id, silent)
      toast({ title: 'You left the group', status: 'success' })
      navigate('/groups')
    } catch (e) {
      console.error('[groups] leave failed:', e)
      toast({ title: 'Couldn’t leave', description: userMessage(e), status: 'error' })
    }
    finally { setActionBusy(false); leaveModal.onClose() }
  }

  async function doDelete() {
    setActionBusy(true)
    try {
      await deleteGroup(id)
      toast({ title: 'Group deleted', status: 'success' })
      navigate('/groups')
    } catch (e) {
      console.error('[groups] delete failed:', e)
      toast({ title: 'Couldn’t delete', description: userMessage(e), status: 'error' })
    }
    finally { setActionBusy(false); deleteModal.onClose() }
  }

  if (loading && !error) return <GroupDetailSkeleton />
  // A failed load or a missing group keeps a page header with the way back.
  if (error || !data) {
    return (
      <Stack spacing={5}>
        <PageHeader eyebrow="Groups" title="Group" leading={<BackButton fallback="/groups" />} />
        <Panel>
          {error
            ? <QueryError error={error} onRetry={load} what="this group" py={12} />
            : <Text color="text.muted">Group not found.</Text>}
        </Panel>
      </Stack>
    )
  }

  const { group, members, expenses, settlements, auditLog } = data
  const isOwner = group.owner_id === user.id

  return (
    <Stack spacing={5}>
      <GroupHeader group={group} members={members} myUserId={user.id} isOwner={isOwner}
        total={formatMoney(groupTotal(expenses, group.currency), group.currency)}
        onPhotoChanged={load} onAdd={to('expenses/new')} onMembers={to('members')}
        onReport={downloadReport} onShare={shareSummary} onRename={to('edit')}
        onLeave={myMember ? leaveModal.onOpen : undefined} onDelete={deleteModal.onOpen} />

      {reportBusy && <BusyNote>Preparing the group statement…</BusyNote>}

      <GroupBalances group={group} members={members} balances={balances} myMember={myMember}
        myUserId={user.id} onSettle={to('settle')} />

      <GroupHistory group={group} members={members} expenses={expenses} settlements={settlements}
        auditLog={auditLog} counts={counts} myMember={myMember} myUserId={user.id} isOwner={isOwner}
        onEdit={(e) => navigate(`/groups/${id}/expenses/${e.id}`)}
        onThread={(itemId) => navigate(`/groups/${id}/comments/${itemId}`)}
        reportBusy={reportBusy} onReport={downloadReport} />

      <LeaveGroupModal group={group} isOwner={isOwner} isOpen={leaveModal.isOpen}
        onClose={leaveModal.onClose} busy={actionBusy} onConfirm={doLeave} />

      {/* Delete confirm (type-to-confirm) */}
      <DeleteGroupModal group={group} isOpen={deleteModal.isOpen} onClose={deleteModal.onClose}
        busy={actionBusy} onConfirm={doDelete} />
    </Stack>
  )
}
