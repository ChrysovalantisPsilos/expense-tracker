import { useState } from 'react'
import {
  List, ListItem, HStack, Stack, Text, Spacer, Divider, IconButton, Tag, useToast,
  useDisclosure, Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody,
  ModalFooter, Button,
} from '@chakra-ui/react'
import { Pencil, Trash2, Paperclip } from 'lucide-react'
import CategoryBadge from './CategoryBadge.jsx'
import TransactionForm from './TransactionForm.jsx'
import { formatMoney } from '../lib/currency.js'
import { receiptUrl } from '../lib/receipts.js'
import { queueTransactionDelete } from '../lib/offlineQueue.js'

// Shared list of personal transactions with edit + delete (full offline).
// Group-mirrored rows (group_expense_id set) are read-only here — they're
// edited in the group — and show a "Group" tag instead of the row actions.
// Each row's income/expense styling follows its own `kind`, so the same
// list renders single-kind pages (Income/Expenses) and mixed search results.
const kindOf = (r, fallback) => r.kind ?? fallback
export default function TransactionList({ rows, kind, baseCurrency, mutate, reload }) {
  const toast = useToast()
  const editModal = useDisclosure()
  const [editing, setEditing] = useState(null)
  const [removing, setRemoving] = useState(null)
  const [busy, setBusy] = useState(false)

  async function openReceipt(path) {
    const url = await receiptUrl(path)
    if (url) window.open(url, '_blank', 'noopener')
    else toast({ title: 'Could not open receipt', status: 'error' })
  }

  function onEdited(updated) {
    editModal.onClose()
    setEditing(null)
    // Optimistic local update; reload for the authoritative category join online.
    mutate((rs) => rs.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)))
    if (navigator.onLine) reload()
  }

  async function confirmRemove() {
    const row = removing
    setBusy(true)
    const prev = rows
    mutate((rs) => rs.filter((r) => r.id !== row.id)) // optimistic
    try {
      await queueTransactionDelete(row.id)
      toast({ title: `${kindOf(row, kind) === 'income' ? 'Income' : 'Expense'} deleted`, status: 'success' })
      if (navigator.onLine) reload()
    } catch (e) {
      mutate(() => prev)
      toast({ title: 'Couldn’t delete', description: e.message, status: 'error' })
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
              <HStack py={3} spacing={3} align="start">
                <CategoryBadge category={r.categories} kind={rk} />
                <Stack spacing={0} flex="1" minW={0}>
                  <Text fontWeight="600" noOfLines={1}>
                    {r.description || r.categories?.name || (rk === 'income' ? 'Income' : 'Expense')}
                  </Text>
                  <Text fontSize="xs" color="text.muted">{r.spent_at}</Text>
                </Stack>
                {shared && <Tag size="sm" colorScheme="brand">Group</Tag>}
                {r.receipt_path && (
                  <IconButton aria-label="Receipt" size="xs" variant="ghost"
                    icon={<Paperclip size={14} />} onClick={() => openReceipt(r.receipt_path)} />
                )}
                <Text fontWeight="semibold" color={rk === 'income' ? 'green.500' : 'text.primary'}>
                  {rk === 'income' ? '+' : ''}{formatMoney(r.amount_minor, r.currency)}
                </Text>
                {!shared && (
                  <>
                    <IconButton aria-label="Edit" size="xs" variant="ghost"
                      icon={<Pencil size={14} />}
                      onClick={() => { setEditing(r); editModal.onOpen() }} />
                    <IconButton aria-label="Delete" size="xs" variant="ghost" color="red.400"
                      icon={<Trash2 size={14} />} onClick={() => setRemoving(r)} />
                  </>
                )}
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
