import { useState } from 'react'
import {
  List, ListItem, HStack, Stack, Text, Divider, Tag, TagLabel, useToast,
  useDisclosure, Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody,
  ModalFooter, Button, Flex,
} from '@chakra-ui/react'
import { Pencil, Trash2 } from 'lucide-react'
import CategoryBadge from '../../shared/ui/CategoryBadge.jsx'
import RowActions from '../../shared/ui/RowActions.jsx'
import RowAmount from '../../shared/ui/RowAmount.jsx'
import TransactionForm from './TransactionForm.jsx'
import { formatMoney } from '../../shared/lib/currency.js'
import { shortDate } from '../../shared/lib/dates.js'
import { groupLabel } from '../../shared/lib/txnRollup.js'
import { deleteTransaction } from './writes.js'
import { saveErrorToast } from '../../shared/lib/saveError.js'

// Shared list of personal transactions with edit + delete.
// Group-mirrored rows (group_expense_id set) are read-only here — they're
// edited in the group — and show their group's tag under the title instead.
// On phones the row actions fold into a ⋯ menu.
// Each row's income/expense styling follows its own `kind`, so the same
// list renders single-kind pages (Income/Expenses) and mixed search results.
const kindOf = (r, fallback) => r.kind ?? fallback
export default function TransactionList({ rows, kind, baseCurrency, mutate, reload }) {
  const toast = useToast()
  const editModal = useDisclosure()
  const [editing, setEditing] = useState(null)
  const [removing, setRemoving] = useState(null)
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
        {rows.map((r, i) => {
          const shared = !!r.group_expense_id
          const rk = kindOf(r, kind)
          return (
            <ListItem key={r.id}>
              {i > 0 && <Divider />}
              <HStack py={3} spacing={3} align="center">
                <CategoryBadge category={r.categories} kind={rk} />
                <Stack spacing={0.5} flex="1" minW={0}>
                  <Text fontWeight="600" noOfLines={1}>
                    {r.description || r.categories?.name || (rk === 'income' ? 'Income' : 'Expense')}
                  </Text>
                  <Flex wrap="wrap" align="center" columnGap={2} rowGap={1}>
                    <Text fontSize="xs" color="text.muted" whiteSpace="nowrap">{shortDate(r.spent_at)}</Text>
                    {shared && (
                      <Tag size="sm" colorScheme="brand" maxW="100%">
                        <TagLabel noOfLines={1}>{groupLabel(r)}</TagLabel>
                      </Tag>
                    )}
                  </Flex>
                </Stack>
                <RowAmount color={rk === 'income' ? 'status.positive' : 'text.primary'}>
                  {rk === 'income' ? '+' : ''}{formatMoney(r.amount_minor, r.currency)}
                </RowAmount>
                <RowActions slots={2} actions={shared ? [] : [
                  { label: 'Edit', icon: Pencil, onClick: () => { setEditing(r); editModal.onOpen() } },
                  { label: 'Delete', icon: Trash2, danger: true, onClick: () => setRemoving(r) },
                ]} />
              </HStack>
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
