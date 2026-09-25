import { useEffect, useState } from 'react'
import {
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Button, Text, HStack, FormControl, FormLabel, Switch, useToast,
} from '@chakra-ui/react'
import { KeyRound } from 'lucide-react'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { passkeysSupported } from '../../shared/lib/supabase.js'
import { claimPromptSlot, releasePromptSlot, whenPromptSlotFree } from '../../shared/lib/promptGate.js'
import { STORAGE_KEYS } from '../../shared/lib/keys.js'
import { getProfile, updateProfile } from '../../shared/lib/profile.js'
import IconTile from '../../shared/ui/kit/IconTile.jsx'
import { toPasskeyList } from './authMethods.js'
import { userMessage } from '../../shared/lib/errors.js'

// sessionStorage can be unavailable (private mode, blocked site data): treat
// that as "not shown yet" and never let it break the prompt.
function shownThisSession() {
  try { return !!sessionStorage.getItem(STORAGE_KEYS.passkeyPrompted) } catch { return false }
}
function markShown() {
  try { sessionStorage.setItem(STORAGE_KEYS.passkeyPrompted, '1') } catch { /* ignore */ }
}

// Shown once per session, right after login, if the user has no passkey yet
// and hasn't turned the reminder off (a profile flag, so it follows them to
// every device). Silently does nothing when passkeys aren't supported or
// aren't enabled server-side (listPasskeys errors), so it never nags in
// unsupported setups.
export default function PasskeyPrompt() {
  const { user, listPasskeys, registerPasskey } = useAuth()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [never, setNever] = useState(false)
  const toast = useToast()

  useEffect(() => {
    if (!passkeysSupported) return
    if (!user?.id || shownThisSession()) return
    let active = true
    getProfile(user.id, 'passkey_reminder_off')
      .then((p) => (p?.passkey_reminder_off ? null : listPasskeys()))
      .then((res) => {
        if (!active || !res || res.error) return
        if (toPasskeyList(res.data).length === 0) {
          // Waits for its turn if another prompt (What's new) is open; the
          // notification prompt then waits for this one.
          whenPromptSlotFree(() => {
            if (!active) return
            markShown()
            claimPromptSlot()
            setOpen(true)
          })
        }
      })
      .catch(() => { /* passkeys not enabled — skip */ })
    return () => { active = false }
  }, [listPasskeys, user?.id])

  async function create() {
    setBusy(true)
    const { error } = await registerPasskey()
    setBusy(false)
    if (error) {
      console.error('[passkeys] create failed:', error)
      toast({ title: 'Couldn’t create passkey', description: userMessage(error), status: 'error' })
      return
    }
    toast({ title: 'Passkey added — you can use it to log in next time', status: 'success' })
    close()
  }

  function close() {
    if (never) updateProfile(user.id, { passkey_reminder_off: true }).catch(() => { /* retried next session */ })
    setOpen(false)
    releasePromptSlot()
  }

  return (
    <Modal isOpen={open} onClose={close} isCentered>
      <ModalOverlay />
      <ModalContent mx={4}>
        <ModalHeader>
          <HStack>
            <IconTile icon={KeyRound} size={36} />
            <Text>Add a passkey</Text>
          </HStack>
        </ModalHeader>
        <ModalBody>
          <Text color="text.muted">
            Log in faster and more securely next time with Face ID, Touch ID, or
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
