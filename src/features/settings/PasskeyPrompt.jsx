import { useEffect, useState } from 'react'
import {
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Button, Text, HStack, Flex, FormControl, FormLabel, Switch, useToast,
} from '@chakra-ui/react'
import { KeyRound } from 'lucide-react'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { passkeysSupported } from '../../shared/lib/supabase.js'
import { claimPromptSlot, releasePromptSlot } from '../../shared/lib/promptGate.js'
import { STORAGE_KEYS } from '../../shared/lib/keys.js'
import { toPasskeyList } from './authMethods.js'

// Storage can be unavailable (private mode, blocked site data): treat that as
// "not set" and never let it break the prompt.
function readFlag(store, key) {
  try { return !!store.getItem(key) } catch { return false }
}
function writeFlag(store, key) {
  try { store.setItem(key, '1') } catch { /* ignore */ }
}

// Shown once per session, right after login, if the user has no passkey yet
// and hasn't asked not to be reminded on this device. Silently does nothing
// when passkeys aren't supported or aren't enabled server-side (listPasskeys
// errors), so it never nags in unsupported setups.
export default function PasskeyPrompt() {
  const { user, listPasskeys, registerPasskey } = useAuth()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [never, setNever] = useState(false)
  const toast = useToast()
  const neverKey = `${STORAGE_KEYS.passkeyNever}:${user?.id}`

  useEffect(() => {
    if (!passkeysSupported) return
    if (readFlag(sessionStorage, STORAGE_KEYS.passkeyPrompted)) return
    if (readFlag(localStorage, neverKey)) return
    let active = true
    listPasskeys()
      .then(({ data, error }) => {
        if (!active || error) return
        if (toPasskeyList(data).length === 0) {
          writeFlag(sessionStorage, STORAGE_KEYS.passkeyPrompted)
          claimPromptSlot() // NotificationPrompt waits its turn
          setOpen(true)
        }
      })
      .catch(() => { /* passkeys not enabled — skip */ })
    return () => { active = false }
  }, [listPasskeys, neverKey])

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
    if (never) writeFlag(localStorage, neverKey)
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
          <FormControl display="flex" alignItems="center" mt={5}>
            <Switch id="passkey-never" isChecked={never} onChange={(e) => setNever(e.target.checked)} />
            <FormLabel htmlFor="passkey-never" mb={0} ml={3} fontWeight="500">
              Don’t remind me again
            </FormLabel>
          </FormControl>
          {never && (
            <Text fontSize="xs" color="text.muted" mt={2}>
              You can still add a passkey anytime in Settings → Security.
            </Text>
          )}
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
