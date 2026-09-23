import {
  Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, ModalOverlay, Text,
} from '@chakra-ui/react'
import { formatMoney } from '../../shared/lib/currency.js'

// "Delete this expense?" — the confirm step before deleting one transaction
// (the list's row action and the transaction page). Open while `row` is set;
// `note` adds a line (e.g. that its rule keeps repeating).
export default function DeleteTransactionDialog({ row, onClose, onConfirm, busy, note }) {
  const noun = row?.kind === 'income' ? 'income' : 'expense'
  return (
    <Modal isOpen={!!row} onClose={onClose} isCentered>
      <ModalOverlay />
      <ModalContent mx={4}>
        <ModalHeader>Delete this {noun}?</ModalHeader>
        <ModalBody>
          <Text color="text.muted">
            {row?.description || row?.categories?.name || 'This entry'} ·{' '}
            {row && formatMoney(row.amount_minor, row.currency)}. This can’t be undone.
            {note && ` ${note}`}
          </Text>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button colorScheme="red" isLoading={busy} onClick={onConfirm}>Delete</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
