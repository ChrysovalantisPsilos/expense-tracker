import {
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Spacer,
} from '@chakra-ui/react'
import { useT } from '../lib/i18n/I18nProvider.jsx'

// The app's standard form dialog: centred modal, a header, a body, and a
// Cancel / submit footer. The whole content is a <form>, so Enter submits;
// `onSubmit` is called after preventDefault. `busy` shows the submit spinner.
//
//   <FormModal isOpen={open} onClose={close} title="Rename group"
//     onSubmit={save} busy={busy} initialFocusRef={nameRef}>…fields…</FormModal>
//
// `submitProps` reach the submit button (colorScheme, isDisabled, loadingText);
// `initialFocusRef` picks the field focused on open; `footerStart` sits at the
// footer's far left (e.g. a delete button); `noValidate` turns off the
// browser's own required-field bubbles for a form that shows its errors
// inline; any other prop (size, scrollBehavior…) goes to the Modal.
export default function FormModal({
  isOpen, onClose, title, onSubmit, busy, submitLabel, submitProps,
  initialFocusRef, footerStart, noValidate, children, ...modalProps
}) {
  const t = useT()
  function handleSubmit(e) {
    e.preventDefault()
    onSubmit()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered initialFocusRef={initialFocusRef} {...modalProps}>
      <ModalOverlay />
      <ModalContent as="form" onSubmit={handleSubmit} noValidate={noValidate} mx={4}>
        <ModalHeader>{title}</ModalHeader>
        <ModalBody>{children}</ModalBody>
        <ModalFooter gap={2}>
          {footerStart && <>{footerStart}<Spacer /></>}
          <Button variant="ghost" onClick={onClose}>{t('actions.cancel')}</Button>
          <Button type="submit" isLoading={busy} {...submitProps}>{submitLabel ?? t('actions.save')}</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
