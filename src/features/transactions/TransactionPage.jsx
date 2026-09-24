import { useState } from 'react'
import { Link as RouterLink, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Button, IconButton, Stack, Text, useToast } from '@chakra-ui/react'
import { ArrowLeft, Users } from 'lucide-react'
import PageHeader from '../../shared/ui/PageHeader.jsx'
import Panel from '../../shared/ui/kit/Panel.jsx'
import QueryError from '../../shared/ui/QueryError.jsx'
import { useProfile } from '../../shared/lib/ProfileProvider.jsx'
import { formatMoney } from '../../shared/lib/currency.js'
import { saveErrorToast } from '../../shared/lib/saveError.js'
import { groupLabel } from '../../shared/lib/txnRollup.js'
import { useRecurring } from '../recurring/recurring.js'
import { useTransaction } from './useData.js'
import { deleteTransaction } from './writes.js'
import TransactionForm from './TransactionForm.jsx'
import DeleteTransactionDialog from './DeleteTransactionDialog.jsx'
import RingLoader from '../../shared/ui/RingLoader.jsx'

const noun = (kind) => (kind === 'income' ? 'income' : 'expense')

// The add/edit page for one expense or income:
//   /transactions/new?kind=expense|income   a new entry
//   /transactions/:id                       an existing one (the list passes
//                                           the row in router state)
// The back arrow — and saving or deleting — returns to wherever the user came
// from, or to /transactions when the page was opened directly. A group share
// is read-only here: it's edited in its group.
export default function TransactionPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const toast = useToast()
  const { baseCurrency = 'EUR' } = useProfile()
  const passed = location.state?.row
  const known = id && passed?.id === id ? passed : null
  const { row, loading, error, reload } = useTransaction(id, known)
  const { rules, loading: rulesLoading } = useRecurring()
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // 'default' is the key of the first page this tab opened: nothing to go
  // back to inside the app.
  const back = () => (location.key !== 'default' ? navigate(-1) : navigate('/transactions', { replace: true }))

  const isNew = !id
  const kind = isNew ? (params.get('kind') === 'income' ? 'income' : 'expense') : row?.kind
  const rule = row?.recurring_rule_id ? rules.find((r) => r.id === row.recurring_rule_id) ?? null : null
  // A linked entry waits for its rule, so the Repeat section opens on it.
  const waiting = loading || (!!row?.recurring_rule_id && rulesLoading)

  async function remove() {
    setDeleting(true)
    try {
      await deleteTransaction(row.id)
      toast({ title: `${row.kind === 'income' ? 'Income' : 'Expense'} deleted`, status: 'success' })
      setConfirming(false)
      back()
    } catch (e) {
      toast(saveErrorToast(e, 'Couldn’t delete'))
    } finally {
      setDeleting(false)
    }
  }

  const title = isNew ? `New ${noun(kind)}` : row ? `Edit ${noun(row.kind)}` : 'Transaction'

  let body
  if (!isNew && error) body = <Panel><QueryError error={error} onRetry={reload} what="this entry" /></Panel>
  else if (!isNew && waiting) body = <RingLoader />
  else if (!isNew && !row) {
    body = (
      <Panel>
        <Stack spacing={3} align="start">
          <Text color="text.muted">This entry doesn’t exist any more.</Text>
          <Button as={RouterLink} to="/transactions" size="sm">Go to Transactions</Button>
        </Stack>
      </Panel>
    )
  } else if (row?.group_expense_id) {
    body = (
      <Panel icon={Users} title={groupLabel(row)}>
        <Stack spacing={3} align="start">
          <Text>
            {row.description || row.categories?.name || 'Group expense'} ·{' '}
            {formatMoney(row.amount_minor, row.currency)}
          </Text>
          <Text fontSize="sm" color="text.muted">
            This is your share of a group expense, so it’s edited in its group.
          </Text>
          {row.group_id && (
            <Button as={RouterLink} to={`/groups/${row.group_id}`} size="sm">Open group</Button>
          )}
        </Stack>
      </Panel>
    )
  } else {
    body = (
      <TransactionForm key={row?.id ?? `new-${kind}`} kind={kind} baseCurrency={baseCurrency}
        transaction={row} rule={rule} onSaved={back} onDelete={row ? () => setConfirming(true) : undefined} />
    )
  }

  return (
    <Stack spacing={5} maxW="640px">
      <PageHeader eyebrow="Transactions" title={title} leading={
        <IconButton aria-label="Back" variant="ghost" size="sm" ml={-2} flexShrink={0}
          icon={<ArrowLeft size={18} />} onClick={back} />
      } />
      {body}

      <DeleteTransactionDialog row={confirming ? row : null} onClose={() => setConfirming(false)}
        onConfirm={remove} busy={deleting}
        note={rule ? 'It keeps repeating: switch Repeat off and save to stop future charges.' : undefined} />
    </Stack>
  )
}
