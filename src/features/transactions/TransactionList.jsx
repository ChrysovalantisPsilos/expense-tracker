import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Box, List, ListItem, Text, Tag, useToast } from '@chakra-ui/react'
import { Pencil, Repeat, Trash2 } from 'lucide-react'
import CategoryBadge from '../../shared/ui/CategoryBadge.jsx'
import ItemRow from '../../shared/ui/kit/ItemRow.jsx'
import DeleteTransactionDialog from '../../shared/ui/DeleteTransactionDialog.jsx'
import { formatMoney, rateText, baseEquivalent, formatSigned } from '../../shared/lib/currency.js'
import { shortDate } from '../../shared/lib/dates.js'
import { groupLabel } from '../../shared/lib/txnRollup.js'
import { monthlyShare } from '../../shared/lib/spread.js'
import { countsForLabel } from '../../shared/lib/salaryShift.js'
import { savingsNoteLabel } from '../../shared/lib/savings.js'
import { useSavingsIds } from '../../shared/lib/categories.js'
import { useProfile } from '../../shared/lib/ProfileProvider.jsx'
import { deleteTransaction } from '../../shared/lib/transactions.js'
import { saveErrorToast } from '../../shared/lib/saveError.js'
import { frequencyLabel } from '../recurring/recurringMath.js'
import MetaLine from '../../shared/ui/MetaLine.jsx'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'
import { categoryDisplayName, entryName } from '../../shared/lib/categoryName.js'

// Shared list of personal transactions with edit + delete.
// Group-mirrored rows (group_expense_id set) are read-only here — they're
// edited in the group — and show their group's tag under the title instead.
// Tapping a row (or Edit) opens it on the transaction page, where it can also
// be set to repeat. Rows that belong to a rule say "Repeats every month", and
// a yearly subscription's payment adds "Spread over 12 months" (it counts in
// monthly spend a twelfth at a time; the row itself is the real payment), and
// a salary paid late in the month says "Counts for October" when the user
// counts it toward the next month (0081; the row keeps its real date). A
// savings entry (0084) says where its money came from: "from income" or
// "received"; an expense paid from savings (0085) says "from savings".
// On phones the row actions fold into a ⋯ menu.
// Each row's income/expense styling follows its own `kind`, so the same
// list renders every mode of the Transactions page (Expenses, Income, All).
const kindOf = (r, fallback) => r.kind ?? fallback
export default function TransactionList({ rows, kind, baseCurrency, mutate, reload }) {
  const t = useT('transactions')
  const toast = useToast()
  const navigate = useNavigate()
  const [removing, setRemoving] = useState(null)
  const [busy, setBusy] = useState(false)
  const { savingsIds } = useSavingsIds()

  // The page gets the row in router state, so it opens without a fetch.
  const open = (r) => navigate(`/transactions/${r.id}`, { state: { row: r } })

  async function confirmRemove() {
    const row = removing
    setBusy(true)
    const prev = rows
    mutate((rs) => rs.filter((r) => r.id !== row.id)) // optimistic
    try {
      await deleteTransaction(row.id)
      toast({ title: t(`list.deleted.${kindOf(row, kind) === 'income' ? 'income' : 'expense'}`), status: 'success' })
      reload()
    } catch (e) {
      mutate(() => prev)
      toast(saveErrorToast(e, t('list.notDeleted')))
    } finally {
      setBusy(false); setRemoving(null)
    }
  }

  return (
    <>
      <List spacing={0}>
        {rows.map((r) => {
          const shared = !!r.group_expense_id
          const rk = kindOf(r, kind)
          const conv = baseEquivalent(r.amount_minor, r.exchange_rate, r.currency, baseCurrency)
          return (
            <ListItem key={r.id}>
              <ItemRow py={2.5} onClick={shared ? undefined : () => open(r)}
                media={<CategoryBadge category={r.categories} kind={rk} size={32} />}
                title={entryName(r, t(`kinds.${rk === 'income' ? 'income' : 'expense'}`))}
                meta={<RowMeta row={r} shared={shared} saved={savingsNoteLabel(r, savingsIds)} />}
                amount={formatSigned(r.amount_minor, r.currency, { plus: rk === 'income' })}
                amountTone={rk === 'income' ? 'positive' : 'default'}
                amountMeta={conv && (
                  <>
                    {t('list.approx', { amount: formatMoney(conv.baseMinor, baseCurrency) })}
                    <Box as="span" display={{ base: 'none', sm: 'inline' }}> · {rateText(conv.rate)}</Box>
                    {/* Rate estimated on this device until the server records it. */}
                    {r.rate_estimated && ` · ${t('list.estimated')}`}
                  </>
                )}
                actionSlots={2} actions={shared ? [] : [
                  { label: t('common:actions.edit'), icon: Pencil, onClick: () => open(r) },
                  { label: t('common:actions.delete'), icon: Trash2, danger: true, onClick: () => setRemoving(r) },
                ]} />
            </ListItem>
          )
        })}
      </List>

      <DeleteTransactionDialog row={removing} onClose={() => setRemoving(null)}
        onConfirm={confirmRemove} busy={busy} />
    </>
  )
}

// The muted line under a row's title: date · category · where savings came
// from · note, then the group's tag on group-share rows. One line sideways.
function RowMeta({ row: r, shared, saved }) {
  const t = useT('transactions')
  const { salaryShift } = useProfile()
  const share = monthlyShare(r)
  const countsFor = countsForLabel(r, salaryShift)
  return (
    <MetaLine>
      <Text whiteSpace="nowrap">{shortDate(r.spent_at)}</Text>
      {r.description && r.categories?.name && (
        <Text overflowWrap="anywhere">{categoryDisplayName(r.categories)}</Text>
      )}
      {saved && <Text whiteSpace="nowrap">{saved}</Text>}
      {r.notes && (
        <Text fontStyle="italic" minW={0} overflowWrap="anywhere">{r.notes}</Text>
      )}
      {shared && (
        <MetaLine.Bare>
          <Tag size="sm" colorScheme="brand" borderRadius="md" maxW="100%" py={0.5}>
            {/* not TagLabel: that clamps to one line */}
            <Text as="span" lineHeight="1.2" overflowWrap="anywhere">{groupLabel(r)}</Text>
          </Tag>
        </MetaLine.Bare>
      )}
      {r.recurring && (
        <Text whiteSpace="nowrap" display="inline-flex" alignItems="center" gap={1}>
          <Repeat size={11} aria-hidden /> {t('list.repeats', { frequency: frequencyLabel(r.recurring) })}
          {!r.recurring.is_active && ` ${t('list.paused')}`}
        </Text>
      )}
      {share && (
        <Text whiteSpace="nowrap">
          {share.exact ? '' : '≈ '}{t('list.spread', {
            amount: formatMoney(share.perMonth, r.currency), months: share.months,
          })}
        </Text>
      )}
      {countsFor && <Text whiteSpace="nowrap">{countsFor}</Text>}
    </MetaLine>
  )
}
