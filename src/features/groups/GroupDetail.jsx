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
import { groupDeleteCheck, groupTotal, groupSummaryText, groupViewer } from './groupFormat.js'
import { formatMoney } from '../../shared/lib/currency.js'
import GroupHeader from './GroupHeader.jsx'
import GroupBalances from './GroupBalances.jsx'
import GroupHistory from './GroupHistory.jsx'
import { GroupDetailSkeleton } from './GroupSkeletons.jsx'
import { DeleteGroupModal, LeaveGroupModal } from './GroupModals.jsx'
import { userMessage } from '../../shared/lib/errors.js'
import { copyText } from '../../shared/lib/clipboard.js'
import { BusyNote } from '../../shared/ui/RingLoader.jsx'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

// A group's page: its header, balances and history. Adding or editing an
// expense, settling up, comments, members and editing the group are pages of
// their own under /groups/:id/…; leaving and deleting are confirmed here.
export default function GroupDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const toast = useToast()
  const t = useT('groups')
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
      { errorTitle: t('detail.reportFailed') })
  }

  const balances = data?.balances ?? new Map()
  const { myMember, isOwner } = groupViewer(data?.group, data?.members, user.id)

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
    if (await copyText(text)) {
      toast({ title: t('detail.summaryCopied'), description: t('detail.summaryPaste'), status: 'success' })
    } else {
      toast({ title: t('detail.summaryFailed'), status: 'error' })
    }
  }

  async function doLeave(silent) {
    setActionBusy(true)
    try {
      await removeMember(myMember.id, silent)
      toast({ title: t('detail.left'), status: 'success' })
      navigate('/groups')
    } catch (e) {
      console.error('[groups] leave failed:', e)
      toast({ title: t('detail.leaveFailed'), description: userMessage(e), status: 'error' })
    }
    finally { setActionBusy(false); leaveModal.onClose() }
  }

  async function doDelete() {
    setActionBusy(true)
    try {
      await deleteGroup(id)
      toast({ title: t('detail.deleted'), status: 'success' })
      navigate('/groups')
    } catch (e) {
      console.error('[groups] delete failed:', e)
      toast({ title: t('detail.deleteFailed'), description: userMessage(e), status: 'error' })
    }
    finally { setActionBusy(false); deleteModal.onClose() }
  }

  if (loading && !error) return <GroupDetailSkeleton />
  // A failed load or a missing group keeps a page header with the way back.
  if (error || !data) {
    return (
      <Stack spacing={5}>
        <PageHeader eyebrow={t('title')} title={t('group')} leading={<BackButton fallback="/groups" />} />
        <Panel>
          {error
            ? <QueryError error={error} onRetry={load} what={t('whatGroup')} py={12} />
            : <Text color="text.muted">{t('notFound')}</Text>}
        </Panel>
      </Stack>
    )
  }

  const { group, members, expenses, settlements, auditLog } = data

  return (
    <Stack spacing={5}>
      <GroupHeader group={group} members={members} myUserId={user.id} isOwner={isOwner}
        total={formatMoney(groupTotal(expenses, group.currency), group.currency)}
        onPhotoChanged={load} onAdd={to('expenses/new')} onMembers={to('members')}
        onReport={downloadReport} onShare={shareSummary} onRename={to('edit')}
        onLeave={myMember ? leaveModal.onOpen : undefined} onDelete={deleteModal.onOpen} />

      {reportBusy && <BusyNote>{t('detail.reportBusy')}</BusyNote>}

      <GroupBalances group={group} members={members} balances={balances} myMember={myMember}
        myUserId={user.id} onSettle={to('settle')} />

      <GroupHistory group={group} members={members} expenses={expenses} settlements={settlements}
        auditLog={auditLog} counts={counts} myMember={myMember} myUserId={user.id} isOwner={isOwner}
        onEdit={(e) => navigate(`/groups/${id}/expenses/${e.id}`)}
        onThread={(itemId) => navigate(`/groups/${id}/comments/${itemId}`)}
        onAdd={to('expenses/new')} onMembers={to('members')}
        reportBusy={reportBusy} onReport={downloadReport} />

      <LeaveGroupModal group={group} isOwner={isOwner} isOpen={leaveModal.isOpen}
        onClose={leaveModal.onClose} busy={actionBusy} onConfirm={doLeave} />

      {/* Delete confirm (type-to-confirm), or why not yet while others are in */}
      <DeleteGroupModal group={group} check={groupDeleteCheck(group, members, user.id)}
        isOpen={deleteModal.isOpen} onClose={deleteModal.onClose}
        busy={actionBusy} onConfirm={doDelete} onMembers={to('members')} />
    </Stack>
  )
}
