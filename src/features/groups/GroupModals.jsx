import { useState } from 'react'
import {
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Stack, Text, FormControl, FormLabel, Input, Button, Checkbox,
} from '@chakra-ui/react'
import { Users } from 'lucide-react'

// The group's confirmation dialogs (its forms are full pages).

// Delete confirm (type-to-confirm). While others are still in the group
// (`check` from groupDeleteCheck) it explains instead, with a way to the
// members list; delete_group refuses the same case on the server.
export function DeleteGroupModal({ group, check, isOpen, onClose, busy, onConfirm, onMembers }) {
  const [text, setText] = useState('')
  const match = text.trim() === group.name
  if (!check.canDelete) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} isCentered>
        <ModalOverlay />
        <ModalContent mx={4}>
          <ModalHeader>Can’t delete “{group.name}” yet</ModalHeader>
          <ModalBody>
            <Stack spacing={3}>
              <Text color="text.muted">
                You can only delete a group once everyone else has left. Remove
                the other members (or ask them to leave) first.
              </Text>
              {check.others.length > 0 && (
                <Text fontSize="sm">
                  Still in the group: <b>{check.others.map((m) => m.display_name).join(', ')}</b>
                </Text>
              )}
            </Stack>
          </ModalBody>
          <ModalFooter gap={2}>
            <Button variant="ghost" onClick={onClose}>Close</Button>
            <Button leftIcon={<Users size={16} />} onClick={onMembers}>Manage members</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    )
  }
  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered>
      <ModalOverlay />
      <ModalContent mx={4}>
        <ModalHeader>Delete “{group.name}”?</ModalHeader>
        <ModalBody>
          <Stack spacing={3}>
            <Text color="text.muted">
              This permanently deletes the group and all its expenses, balances,
              and settlements for <b>everyone</b> — and removes the shared
              expenses mirrored into members’ personal trackers. Only possible
              when everyone is settled up. This can’t be undone.
            </Text>
            <FormControl>
              <FormLabel fontSize="sm">Type the group name to confirm</FormLabel>
              <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={group.name} />
            </FormControl>
          </Stack>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button colorScheme="red" isDisabled={!match} isLoading={busy} onClick={onConfirm}>
            Delete group
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}

// Leave confirm; `onConfirm(silent)` — silent skips notifying the group.
export function LeaveGroupModal({ group, isOwner, isOpen, onClose, busy, onConfirm }) {
  const [silent, setSilent] = useState(false)
  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered>
      <ModalOverlay />
      <ModalContent mx={4}>
        <ModalHeader>Leave “{group.name}”?</ModalHeader>
        <ModalBody>
          <Stack spacing={4}>
            <Text color="text.muted">
              You can only leave once your balance is settled. Your past expenses
              stay in the group for everyone else.
              {isOwner && ' As the owner, ownership passes to another member.'}
            </Text>
            <Checkbox isChecked={silent} onChange={(e) => setSilent(e.target.checked)}>
              <Text fontSize="sm">Leave silently — don’t notify the group</Text>
            </Checkbox>
          </Stack>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button colorScheme="red" isLoading={busy} onClick={() => onConfirm(silent)}>Leave</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}

// Remove-member confirm (owner only); `member` null = closed.
export function RemoveMemberModal({ member, onClose, busy, onConfirm }) {
  return (
    <Modal isOpen={!!member} onClose={onClose} isCentered>
      <ModalOverlay />
      <ModalContent mx={4}>
        <ModalHeader>Remove {member?.display_name}?</ModalHeader>
        <ModalBody>
          <Text color="text.muted">
            They can only be removed if settled up. If they’ve been part of any
            expenses, their history is kept.
          </Text>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button colorScheme="red" isLoading={busy} onClick={onConfirm}>Remove</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
