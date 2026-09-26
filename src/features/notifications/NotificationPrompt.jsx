import { useEffect, useState } from 'react'
import {
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Button, Text, HStack, Stack, Flex, useToast, Checkbox,
} from '@chakra-ui/react'
import { BellRing } from 'lucide-react'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { patchRow } from '../../shared/lib/db.js'
import { enablePush, pushSupported } from '../../shared/lib/push.js'
import { STORAGE_KEYS } from '../../shared/lib/keys.js'
import { claimPromptSlot, releasePromptSlot, whenPromptSlotFree } from '../../shared/lib/promptGate.js'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

const SEEN = STORAGE_KEYS.notifPrompted

// One-time ask, shortly after login: enable push notifications (and confirm
// the email preference for big events)? "Not now" never auto-asks again —
// the Settings switches stay the way to change either choice later. Waits for
// the prompt slot so it never stacks on the passkey prompt.
export default function NotificationPrompt() {
  const t = useT('notifications')
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
    const timer = setTimeout(() => {
      whenPromptSlotFree(() => {
        if (!active) return
        claimPromptSlot()
        setOpen(true)
      })
    }, 1200)
    return () => { active = false; clearTimeout(timer) }
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
    catch { /* non-fatal; the Settings switch can still change it */ }
    try {
      const status = await enablePush()
      if (status === 'subscribed') {
        toast({ title: t('prompt.on.title'), status: 'success',
          description: t('prompt.on.body') })
      } else if (status === 'denied') {
        toast({ title: t('prompt.blocked.title'), status: 'info',
          description: t('prompt.blocked.body') })
      } else {
        toast({ title: t('prompt.unsupported.title'), status: 'info',
          description: t('prompt.unsupported.body') })
      }
    } catch {
      toast({ title: t('prompt.failed'), status: 'warning' })
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
            <Text>{t('prompt.title')}</Text>
          </HStack>
        </ModalHeader>
        <ModalBody>
          <Stack spacing={4}>
            <Text color="text.muted">
              {t('prompt.body')}
            </Text>
            <Checkbox isChecked={emailToo}
              onChange={(e) => setEmailToo(e.target.checked)}>
              <Text fontSize="sm">
                {t('prompt.emailToo')}
              </Text>
            </Checkbox>
          </Stack>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="ghost" onClick={close}>{t('prompt.notNow')}</Button>
          <Button leftIcon={<BellRing size={16} />} isLoading={busy} onClick={enable}>
            {t('prompt.enable')}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
