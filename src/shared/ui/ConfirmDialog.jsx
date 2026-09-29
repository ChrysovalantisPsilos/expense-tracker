import {
  Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, ModalOverlay, Text,
} from '@chakra-ui/react'
import { useT } from '../lib/i18n/I18nProvider.jsx'

// The app's confirm step: a centred modal with a title, a muted `body` line
// and/or richer `children`, then Cancel (or `cancelLabel`) and the confirm
// button. `danger` makes the confirm red (deleting, leaving); `disabled` holds
// it until the dialog's own check passes; `busy` spins it while the action
// runs; `confirmIcon` goes before its label.
export default function ConfirmDialog({
  isOpen, title, body, children, confirmLabel, cancelLabel, confirmIcon,
  danger = false, busy = false, disabled = false, onConfirm, onClose,
}) {
  const t = useT('common')
  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered>
      <ModalOverlay />
      <ModalContent mx={4}>
        <ModalHeader>{title}</ModalHeader>
        <ModalBody>
          {body != null && <Text color="text.muted">{body}</Text>}
          {children}
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="ghost" onClick={onClose}>{cancelLabel ?? t('actions.cancel')}</Button>
          <Button colorScheme={danger ? 'red' : undefined} leftIcon={confirmIcon}
            isDisabled={disabled} isLoading={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
