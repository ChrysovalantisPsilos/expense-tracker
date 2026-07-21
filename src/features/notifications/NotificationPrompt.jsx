import { useEffect, useState } from 'react'
import {
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Button, Text, HStack, Stack, Flex, useToast, Checkbox,
} from '@chakra-ui/react'
import { BellRing } from 'lucide-react'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { patchRow } from '../../shared/lib/db.js'
import { enablePush, pushSupported } from '../../shared/lib/push.js'
import { claimPromptSlot, releasePromptSlot, whenPromptSlotFree } from '../../shared/lib/promptGate.js'

const SEEN = 'budge:notifPrompted'

// One-time ask, shortly after login: enable push notifications (and confirm
// the email preference for big events)? "Not now" never auto-asks again —
// the Profile switches stay the way to change either choice later. Waits for
// the prompt slot so it never stacks on the passkey prompt.
export default function NotificationPrompt() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [emailToo, setEmailToo] = useState(true)
  const toast = useToast()

  useEffect(() => {
    if (!pushSupported()) return
    if (localStorage.getItem(SEEN)) return
    if (Notification.permission === 'granted') {
      // Already allowed at the browser level (e.g. enabled on this browser
      // before) — just make sure this device is enrolled, no modal needed.
      localStorage.setItem(SEEN, '1')
      enablePush().catch(() => {})
      return
    }
    if (Notification.permission === 'denied') {
      localStorage.setItem(SEEN, '1')
      return
    }
    let active = true
    const t = setTimeout(() => {
      whenPromptSlotFree(() => {
        if (!active) return
        claimPromptSlot()
        setOpen(true)
      })
    }, 1200)
    return () => { active = false; clearTimeout(t) }
  }, [])

  function close() {
    localStorage.setItem(SEEN, '1')
    setOpen(false)
    releasePromptSlot()
  }

  async function enable() {
    setBusy(true)
    // Email choice: the checkbox decides (defaults on, matching the account
    // default — unticking here is an explicit opt-out of big-event emails).
    try { await patchRow('profiles', user.id, { notify_email: emailToo }) }
    catch { /* non-fatal; the Profile switch can still change it */ }
    try {
      const status = await enablePush()
      if (status === 'subscribed') {
        toast({ title: 'Notifications on', status: 'success',
          description: 'You’ll get group activity and payment reminders on this device.' })
      } else if (status === 'denied') {
        toast({ title: 'Notifications blocked', status: 'info',
          description: 'You can allow them in your browser settings anytime.' })
      } else {
        toast({ title: 'Push isn’t available in this browser', status: 'info',
          description: 'On iPhone, install Budge to your home screen first.' })
      }
    } catch {
      toast({ title: 'Couldn’t enable notifications on this device', status: 'warning' })
    }
    setBusy(false)
    close()
  }

  return (
    <Modal isOpen={open} onClose={close} isCentered>
      <ModalOverlay />
      <ModalContent mx={4}>
        <ModalHeader>
          <HStack>
            <Flex boxSize="36px" align="center" justify="center" borderRadius="lg"
              bg="bg.subtle" color="accent.fg"><BellRing size={20} /></Flex>
            <Text>Turn on notifications?</Text>
          </HStack>
        </ModalHeader>
        <ModalBody>
          <Stack spacing={4}>
            <Text color="text.muted">
              Get a heads-up when friends add expenses or invite you to a group,
              and reminders before your bills are due. You can change this
              anytime in Profile → Notifications.
            </Text>
            <Checkbox colorScheme="brand" isChecked={emailToo}
              onChange={(e) => setEmailToo(e.target.checked)}>
              <Text fontSize="sm">
                Also email me about big events — invites, members joining or leaving
              </Text>
            </Checkbox>
          </Stack>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="ghost" onClick={close}>Not now</Button>
          <Button leftIcon={<BellRing size={16} />} isLoading={busy} onClick={enable}>
            Enable
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
