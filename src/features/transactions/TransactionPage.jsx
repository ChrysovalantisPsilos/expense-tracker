import { useCallback, useRef, useState } from 'react'
import { Link as RouterLink, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { Button, IconButton, Stack, Text, useToast } from '@chakra-ui/react'
import { ArrowLeft, Users } from 'lucide-react'
import PageHeader from '../../shared/ui/PageHeader.jsx'
import { FORM_COLUMN } from '../../shared/ui/FormPage.jsx'
import Panel from '../../shared/ui/kit/Panel.jsx'
import QueryError from '../../shared/ui/QueryError.jsx'
import SegmentedControl from '../../shared/ui/SegmentedControl.jsx'
import useGoBack from '../../shared/ui/useGoBack.js'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { useProfile } from '../../shared/lib/ProfileProvider.jsx'
import { formatMoney } from '../../shared/lib/currency.js'
import { saveErrorToast } from '../../shared/lib/saveError.js'
import { groupLabel } from '../../shared/lib/txnRollup.js'
import { useRecurring } from '../recurring/recurring.js'
import { rememberGroup, useMyGroups } from '../groups/myGroups.js'
import { carryDraft, validGroupParam } from '../groups/quickAddMath.js'
import WhoForChips from '../groups/WhoForChips.jsx'
import GroupExpenseForm from '../groups/GroupExpenseForm.jsx'
import { useTransaction, deleteTransaction } from '../../shared/lib/transactions.js'
import TransactionForm, { kindOptions } from './TransactionForm.jsx'
import DeleteTransactionDialog from './DeleteTransactionDialog.jsx'
import RingLoader from '../../shared/ui/RingLoader.jsx'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'
import { categoryDisplayName } from '../../shared/lib/categoryName.js'

// The add/edit page for one expense or income:
//   /transactions/new?kind=expense|income   a new entry; &category=<id>
//                                           opens it on one of the user's
//                                           categories of that kind
//   /transactions/:id                       an existing one (the list passes
//                                           the row in router state)
// The back arrow — and saving or deleting — returns to wherever the user came
// from, or to /transactions when the page was opened directly. A group share
// is read-only here: it's edited in its group.
//
// A new expense asks "Who's it for?" when the user is in any group: "Just
// me" (this page's own form) or one of their groups, which turns the page
// into that group's expense form (GroupExpenseForm's quick layout; saving it
// adds a shared expense, whose share the server mirrors into the user's
// expenses). Picking is page state, not a new page: it's mirrored into
// ?group=<id> by replacing the entry, so a reload keeps it and Back still
// leaves the Add page. The typed amount, currency, description and date go
// along either way (carryDraft); switching to Income returns to Just me.
export default function TransactionPage() {
  const t = useT('transactions')
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const toast = useToast()
  const { user } = useAuth()
  const { baseCurrency, profile, loading: profileLoading } = useProfile()
  const passed = location.state?.row
  const known = id && passed?.id === id ? passed : null
  const { row, loading, error, reload } = useTransaction(id, known)
  const { rules, loading: rulesLoading } = useRecurring()
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const back = useGoBack('/transactions', { replace: true })

  const isNew = !id
  const linkKind = params.get('kind') === 'income' ? 'income' : 'expense'
  // A new entry's kind as the user last switched it (the title follows it);
  // a link to the other kind starts over from that one.
  const [kindNow, setKindNow] = useState(linkKind)
  const [kindFrom, setKindFrom] = useState(linkKind)
  if (kindFrom !== linkKind) {
    setKindFrom(linkKind)
    setKindNow(linkKind)
  }
  const kind = isNew ? kindNow : row?.kind

  // "Who's it for?": the group picked (null = Just me), honoured only once
  // it's known to be one of the user's groups.
  const { groups, loading: groupsLoading } = useMyGroups({ enabled: isNew })
  const [target, setTarget] = useState(() => (isNew && linkKind === 'expense' ? params.get('group') : null))
  const groupId = isNew ? validGroupParam(target, groups) : null
  const group = groupId ? groups.find((g) => g.id === groupId) : null
  // Each pick mounts a fresh form (`nonce` in its key) that starts from what
  // the other one had typed (`draft`); `chips` keeps the row's scroll and
  // focus across that swap.
  const [nonce, setNonce] = useState(0)
  const draft = useRef(null)
  const chips = useRef({ scrollLeft: 0, focus: false })
  const onDraft = useCallback((d) => { draft.current = d }, [])

  function pickGroup(next) {
    setTarget(next)
    setNonce((n) => n + 1)
    setParams((p) => {
      const q = new URLSearchParams(p)
      if (next) q.set('group', next)
      else q.delete('group')
      return q
    }, { replace: true })
  }
  function pickKind(k) {
    if (k !== 'income') return
    setKindNow('income')
    pickGroup(null)
  }

  const rule = row?.recurring_rule_id ? rules.find((r) => r.id === row.recurring_rule_id) ?? null : null
  // A linked entry waits for its rule, so the Repeat section opens on it.
  const waiting = loading || (!!row?.recurring_rule_id && rulesLoading)
  // A new entry starts in the base currency, which the form reads once: wait
  // for the profile rather than freeze the 'EUR' placeholder.
  const profilePending = !profile && profileLoading
  // A ?group= link waits for the groups, rather than open on Just me and
  // then swap the form.
  const groupPending = isNew && !!target && groupsLoading

  async function remove() {
    setDeleting(true)
    try {
      await deleteTransaction(row.id)
      toast({ title: t(`list.deleted.${row.kind === 'income' ? 'income' : 'expense'}`), status: 'success' })
      setConfirming(false)
      back()
    } catch (e) {
      toast(saveErrorToast(e, t('list.notDeleted')))
    } finally {
      setDeleting(false)
    }
  }

  const title = t(`page.title.${group ? 'shared'
    : isNew ? (kind === 'income' ? 'newIncome' : 'newExpense')
      : row ? (row.kind === 'income' ? 'editIncome' : 'editExpense') : 'fallback'}`)
  // Only for someone in a group: without one the form is exactly as before.
  const who = isNew && groups.length > 0 && (
    <WhoForChips groups={groups} value={groupId} onChange={pickGroup} memory={chips} />
  )

  let body
  if (!isNew && error) body = <Panel><QueryError error={error} onRetry={reload} what={t('page.what')} /></Panel>
  else if ((!isNew && waiting) || profilePending || groupPending) body = <RingLoader />
  else if (!isNew && !row) {
    body = (
      <Panel>
        <Stack spacing={3} align="start">
          <Text color="text.muted">{t('page.gone')}</Text>
          <Button as={RouterLink} to="/transactions" size="sm">{t('page.goToList')}</Button>
        </Stack>
      </Panel>
    )
  } else if (row?.group_expense_id) {
    body = (
      <Panel icon={Users} title={groupLabel(row)}>
        <Stack spacing={3} align="start">
          <Text>
            {row.description || categoryDisplayName(row.categories) || t('page.groupExpense')} ·{' '}
            {formatMoney(row.amount_minor, row.currency)}
          </Text>
          <Text fontSize="sm" color="text.muted">{t('page.groupShare')}</Text>
          {row.group_id && (
            <Button as={RouterLink} to={`/groups/${row.group_id}`} size="sm">{t('page.openGroup')}</Button>
          )}
        </Stack>
      </Panel>
    )
  } else if (group) {
    const me = group.members.find((m) => m.user_id === user?.id)
    body = (
      <GroupExpenseForm key={`group-${group.id}-${nonce}`} quick group={group} members={group.members}
        myMemberId={me?.id} myUserId={user?.id} defaultPayer={me?.id}
        initial={carryDraft(draft.current, group.currency)} onDraft={onDraft}
        lead={(
          <>
            <SegmentedControl label={t('form.kind')} options={kindOptions(t)} value="expense" onChange={pickKind} size="sm" isFitted />
            {who}
          </>
        )}
        onSaved={() => { rememberGroup(group.id); back() }} />
    )
  } else if (isNew) {
    body = (
      <TransactionForm key={`new-${linkKind}-${baseCurrency}-${nonce}`} kind={kindNow} baseCurrency={baseCurrency}
        initial={carryDraft(draft.current, baseCurrency)} onDraft={onDraft} onKind={setKindNow} who={who}
        initialCategory={params.get('category')} onSaved={back} />
    )
  } else {
    body = (
      <TransactionForm key={row.id} kind={kind} baseCurrency={baseCurrency}
        transaction={row} rule={rule} onSaved={back} onDelete={() => setConfirming(true)} />
    )
  }

  return (
    <Stack spacing={5} {...FORM_COLUMN}>
      <PageHeader eyebrow={group ? group.name : t('ledger.title')} title={title} leading={
        <IconButton aria-label={t('common:actions.back')} variant="ghost" size="sm" ml={-2} flexShrink={0}
          icon={<ArrowLeft size={18} />} onClick={back} />
      } />
      {body}

      <DeleteTransactionDialog row={confirming ? row : null} onClose={() => setConfirming(false)}
        onConfirm={remove} busy={deleting}
        note={rule ? t('page.keepsRepeating') : undefined} />
    </Stack>
  )
}
