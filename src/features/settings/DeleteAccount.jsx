import { useState } from 'react'
import {
  Box, Card, CardBody, Flex, Heading, HStack, Stack, Text, Button, FormControl,
  FormLabel, Input, useDisclosure, useToast, Modal, ModalOverlay, ModalContent,
  ModalHeader, ModalBody, ModalFooter,
} from '@chakra-ui/react'
import { AlertTriangle, Trash2 } from 'lucide-react'
import { supabase, edgeFunctionError } from '../../shared/lib/supabase.js'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import Eyebrow from '../../shared/ui/Eyebrow.jsx'
import { hasPasswordIdentity } from './authMethods.js'

// The danger zone at the foot of Security: set apart by space and a red
// label, with the confirm-to-delete modal behind its button.
export default function DeleteAccount({ user }) {
  const { signOut } = useAuth()
  const deleteModal = useDisclosure()
  return (
    <Box pt={6}>
      <Eyebrow color="status.negative" mb={2}>Danger zone</Eyebrow>
      <Card borderColor="status.negativeBorder"><CardBody>
        <HStack spacing={3} mb={2}>
          <Flex boxSize="32px" align="center" justify="center" borderRadius="lg" flexShrink={0}
            bg="status.negativeSubtle" color="status.negative">
            <AlertTriangle size={16} />
          </Flex>
          <Heading as="h2" size="sm">Delete account</Heading>
        </HStack>
        <Text fontSize="sm" color="text.muted" mb={4}>
          Permanently deletes your account and personal data. Groups you own pass
          to another member; your expense history stays for them. This can’t be undone.
        </Text>
        <Button colorScheme="red" variant="outline" leftIcon={<Trash2 size={16} />}
          onClick={deleteModal.onOpen}>Delete my account</Button>
      </CardBody></Card>

      <DeleteAccountModal user={user} isOpen={deleteModal.isOpen} onClose={deleteModal.onClose}
        signOut={signOut} />
    </Box>
  )
}

function DeleteAccountModal({ user, isOpen, onClose, signOut }) {
  const toast = useToast()
  // Require a password if the user has an email/password identity (default to
  // requiring it when we can't tell); otherwise ask for a typed phrase.
  const isPasswordUser = hasPasswordIdentity(user)
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)

  const canSubmit = isPasswordUser ? value.length > 0 : value.trim().toUpperCase() === 'DELETE'

  async function confirm() {
    setBusy(true)
    try {
      // The server re-verifies the password for password users, so pass it along.
      const body = isPasswordUser ? { password: value } : {}
      const { error } = await supabase.functions.invoke('delete-account', { body })
      if (error) throw new Error(await edgeFunctionError(error))
      toast({ title: 'Your account has been deleted', status: 'success' })
      await signOut() // App flips to the logged-out landing
    } catch (e) {
      toast({ title: 'Could not delete account', description: e.message, status: 'error' })
      setBusy(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered>
      <ModalOverlay />
      <ModalContent as="form" mx={4}
        onSubmit={(e) => { e.preventDefault(); if (canSubmit) confirm() }}>
        <ModalHeader>Delete your account?</ModalHeader>
        <ModalBody>
          <Stack spacing={4}>
            <Text color="text.muted" fontSize="sm">
              This permanently deletes your account and personal data. Groups you
              own are handed to another member; your expense history stays for
              them. This can’t be undone.
            </Text>
            <FormControl isRequired>
              <FormLabel>{isPasswordUser ? 'Enter your password to confirm'
                : 'Type DELETE to confirm'}</FormLabel>
              <Input type={isPasswordUser ? 'password' : 'text'} autoFocus value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={isPasswordUser ? 'Your password' : 'DELETE'} />
            </FormControl>
          </Stack>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button colorScheme="red" type="submit" isLoading={busy} isDisabled={!canSubmit}>
            Delete account
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
