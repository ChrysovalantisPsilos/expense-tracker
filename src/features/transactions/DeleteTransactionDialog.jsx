import {
  Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, ModalOverlay, Text,
} from '@chakra-ui/react'
import { formatMoney } from '../../shared/lib/currency.js'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

// "Delete this expense?" — the confirm step before deleting one transaction
// (the list's row action and the transaction page). Open while `row` is set;
// `note` adds a line (e.g. that its rule keeps repeating).
export default function DeleteTransactionDialog({ row, onClose, onConfirm, busy, note }) {
  const t = useT('transactions')
  const kind = row?.kind === 'income' ? 'income' : 'expense'
  return (
    <Modal isOpen={!!row} onClose={onClose} isCentered>
      <ModalOverlay />
      <ModalContent mx={4}>
        <ModalHeader>{t(`deleteDialog.title.${kind}`)}</ModalHeader>
        <ModalBody>
          <Text color="text.muted">
            {row && t('deleteDialog.body', {
              name: row.description || row.categories?.name || t('deleteDialog.thisEntry'),
              amount: formatMoney(row.amount_minor, row.currency),
            })}
            {note && ` ${note}`}
          </Text>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="ghost" onClick={onClose}>{t('actions.cancel')}</Button>
          <Button colorScheme="red" isLoading={busy} onClick={onConfirm}>{t('actions.delete')}</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
