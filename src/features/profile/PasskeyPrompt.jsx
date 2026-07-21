import { useEffect, useState } from 'react'
import {
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Button, Text, HStack, Flex, useToast,
} from '@chakra-ui/react'
import { KeyRound } from 'lucide-react'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { passkeysSupported } from '../../shared/lib/supabase.js'
import { claimPromptSlot, releasePromptSlot } from '../../shared/lib/promptGate.js'

const SEEN = 'budge:passkeyPrompted'

// Shown once per session, right after login, if the user has no passkey yet.
// Silently does nothing when passkeys aren't supported or aren't enabled
// server-side (listPasskeys errors), so it never nags in unsupported setups.
export default function PasskeyPrompt() {
  const { listPasskeys, registerPasskey } = useAuth()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  useEffect(() => {
    if (!passkeysSupported) return
    if (sessionStorage.getItem(SEEN)) return
    let active = true
    listPasskeys()
      .then(({ data, error }) => {
        if (!active || error) return
        const list = Array.isArray(data) ? data : (data?.passkeys ?? [])
        if (list.length === 0) {
          sessionStorage.setItem(SEEN, '1')
          claimPromptSlot() // NotificationPrompt waits its turn
          setOpen(true)
        }
      })
      .catch(() => { /* passkeys not enabled — skip */ })
    return () => { active = false }
  }, [listPasskeys])

  async function create() {
    setBusy(true)
    const { error } = await registerPasskey()
    setBusy(false)
    if (error) {
      toast({ title: 'Couldn’t create passkey', description: error.message, status: 'error' })
      return
    }
    toast({ title: 'Passkey added — you can use it to sign in next time', status: 'success' })
    close()
  }

  function close() {
    setOpen(false)
    releasePromptSlot()
  }

  return (
    <Modal isOpen={open} onClose={close} isCentered>
      <ModalOverlay />
      <ModalContent mx={4}>
        <ModalHeader>
          <HStack>
            <Flex boxSize="36px" align="center" justify="center" borderRadius="lg"
              bg="bg.subtle" color="accent.fg"><KeyRound size={20} /></Flex>
            <Text>Add a passkey</Text>
          </HStack>
        </ModalHeader>
        <ModalBody>
          <Text color="text.muted">
            Sign in faster and more securely next time with Face ID, Touch ID, or
            your device PIN — no password to remember.
          </Text>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="ghost" onClick={close}>Not now</Button>
          <Button leftIcon={<KeyRound size={16} />} isLoading={busy} onClick={create}>
            Create passkey
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
