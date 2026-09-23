import { useState } from 'react'
import {
  Box, List, ListItem, Text, Tag, TagLabel, useToast,
  useDisclosure, Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody,
  ModalFooter, Button, Flex,
} from '@chakra-ui/react'
import { Pencil, Repeat, Trash2 } from 'lucide-react'
import CategoryBadge from '../../shared/ui/CategoryBadge.jsx'
import ItemRow from '../../shared/ui/kit/ItemRow.jsx'
import TransactionForm from './TransactionForm.jsx'
import { formatMoney, baseEquivalent } from '../../shared/lib/currency.js'
import { shortDate } from '../../shared/lib/dates.js'
import { groupLabel } from '../../shared/lib/txnRollup.js'
import { spreadLabel } from '../../shared/lib/spread.js'
import { deleteTransaction } from './writes.js'
import { saveErrorToast } from '../../shared/lib/saveError.js'
import RecurringForm from '../recurring/RecurringForm.jsx'
import { canMakeRecurring, frequencyLabel, ruleFromTransaction } from '../recurring/recurringMath.js'

// Shared list of personal transactions with edit + delete.
// Group-mirrored rows (group_expense_id set) are read-only here — they're
// edited in the group — and show their group's tag under the title instead.
// "Make recurring" turns a row into a recurring rule (next charge one period
// after it); rows that belong to a rule say "Repeats every month", and a
// yearly subscription's payment adds "Spread over 12 months" (it counts in
// monthly spend a twelfth at a time; the row itself is the real payment).
// On phones the row actions fold into a ⋯ menu.
// Each row's income/expense styling follows its own `kind`, so the same
// list renders every mode of the Transactions page (Expenses, Income, All).
const kindOf = (r, fallback) => r.kind ?? fallback
export default function TransactionList({ rows, kind, baseCurrency, mutate, reload }) {
  const toast = useToast()
  const editModal = useDisclosure()
  const [editing, setEditing] = useState(null)
  const [removing, setRemoving] = useState(null)
  const [repeating, setRepeating] = useState(null) // the row being made recurring
  const [busy, setBusy] = useState(false)

  function onEdited(updated) {
    editModal.onClose()
    setEditing(null)
    // Optimistic local update; reload for the authoritative category join.
    mutate((rs) => rs.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)))
    reload()
  }

  async function confirmRemove() {
    const row = removing
    setBusy(true)
    const prev = rows
    mutate((rs) => rs.filter((r) => r.id !== row.id)) // optimistic
    try {
      await deleteTransaction(row.id)
      toast({ title: `${kindOf(row, kind) === 'income' ? 'Income' : 'Expense'} deleted`, status: 'success' })
      reload()
    } catch (e) {
      mutate(() => prev)
      toast(saveErrorToast(e, 'Couldn’t delete'))
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
              <ItemRow py={2.5}
                media={<CategoryBadge category={r.categories} kind={rk} size={32} />}
                title={r.description || r.categories?.name || (rk === 'income' ? 'Income' : 'Expense')}
                meta={<RowMeta row={r} shared={shared} />}
                amount={`${rk === 'income' ? '+' : ''}${formatMoney(r.amount_minor, r.currency)}`}
                amountTone={rk === 'income' ? 'positive' : 'default'}
                amountMeta={conv && (
                  <>
                    ≈ {formatMoney(conv.baseMinor, baseCurrency)}
                    <Box as="span" display={{ base: 'none', sm: 'inline' }}> · {conv.rate}</Box>
                    {/* Rate estimated on this device until the server records it. */}
                    {r.rate_estimated && ' · est.'}
                  </>
                )}
                actionSlots={3} actions={shared ? [] : [
                  { label: 'Edit', icon: Pencil, onClick: () => { setEditing(r); editModal.onOpen() } },
                  ...(canMakeRecurring(r)
                    ? [{ label: 'Make recurring', icon: Repeat, onClick: () => setRepeating(r) }] : []),
                  { label: 'Delete', icon: Trash2, danger: true, onClick: () => setRemoving(r) },
                ]} />
            </ListItem>
          )
        })}
      </List>

      {/* Edit modal */}
      <Modal isOpen={editModal.isOpen} onClose={() => { editModal.onClose(); setEditing(null) }} isCentered>
        <ModalOverlay />
        <ModalContent mx={4}>
          <ModalHeader>Edit {kindOf(editing ?? {}, kind) === 'income' ? 'income' : 'expense'}</ModalHeader>
          <ModalBody pb={5}>
            {editing && (
              <TransactionForm baseCurrency={baseCurrency} transaction={editing} onSaved={onEdited} />
            )}
          </ModalBody>
        </ModalContent>
      </Modal>

      {repeating && (
        <RecurringForm baseCurrency={baseCurrency}
          initial={{ ...ruleFromTransaction(repeating), from_date: repeating.spent_at }}
          onClose={() => setRepeating(null)} onSaved={() => { setRepeating(null); reload() }} />
      )}

      {/* Delete confirm */}
      <Modal isOpen={!!removing} onClose={() => setRemoving(null)} isCentered>
        <ModalOverlay />
        <ModalContent mx={4}>
          <ModalHeader>Delete this {kindOf(removing ?? {}, kind) === 'income' ? 'income' : 'expense'}?</ModalHeader>
          <ModalBody>
            <Text color="text.muted">
              {removing?.description || removing?.categories?.name || 'This entry'} ·{' '}
              {removing && formatMoney(removing.amount_minor, removing.currency)}. This can’t be undone.
            </Text>
          </ModalBody>
          <ModalFooter gap={2}>
            <Button variant="ghost" onClick={() => setRemoving(null)}>Cancel</Button>
            <Button colorScheme="red" isLoading={busy} onClick={confirmRemove}>Delete</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  )
}

// The muted line under a row's title: date · category · note, then the
// group's tag on group-share rows.
function RowMeta({ row: r, shared }) {
  return (
    <Flex wrap="wrap" align="center" columnGap={1.5} rowGap={1} mt={0.5} fontSize="xs" color="text.muted">
      <Text whiteSpace="nowrap">{shortDate(r.spent_at)}</Text>
      {r.description && r.categories?.name && (
        <Text whiteSpace="nowrap">· {r.categories.name}</Text>
      )}
      {r.notes && (
        <Text fontStyle="italic" noOfLines={1} minW={0} title={r.notes}>· {r.notes}</Text>
      )}
      {shared && (
        <Tag size="sm" colorScheme="brand" borderRadius="full" maxW="100%">
          <TagLabel noOfLines={1}>{groupLabel(r)}</TagLabel>
        </Tag>
      )}
      {r.recurring && (
        <Text whiteSpace="nowrap" display="inline-flex" alignItems="center" gap={1}>
          · <Repeat size={11} aria-hidden /> Repeats {frequencyLabel(r.recurring)}
          {!r.recurring.is_active && ' (paused)'}
        </Text>
      )}
      {spreadLabel(r) && <Text whiteSpace="nowrap">· {spreadLabel(r)}</Text>}
    </Flex>
  )
}
