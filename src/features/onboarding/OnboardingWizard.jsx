import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Stack, HStack, Text, Heading, FormControl, FormLabel, Input, Select, Button,
  IconButton, Progress, Box, useToast,
} from '@chakra-ui/react'
import { X, ArrowRight, ArrowLeft, Sparkles, Landmark, Users, BellRing, KeyRound } from 'lucide-react'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { passkeysSupported } from '../../shared/lib/supabase.js'
import { CURRENCIES } from '../../shared/lib/currency.js'
import { EVENTS } from '../../shared/lib/keys.js'
import { enablePush, pushSupported } from '../../shared/lib/push.js'
import { useAsyncSubmit } from '../../shared/lib/useAsyncSubmit.js'
import { updateProfile, savePaymentInfo } from '../profile/profile.js'
import { createGroup } from '../groups/groups.js'
import Logo from '../../shared/ui/Logo.jsx'

// Post-signup setup wizard. Shows once per account (App gates on
// profiles.onboarded_at). Collects the essentials, folds in the notification +
// passkey asks so they don't fire separately, and every step is skippable —
// closing at any point stamps onboarded_at so it never nags again.
export default function OnboardingWizard({ profile, onDone }) {
  const { user, registerPasskey } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [step, setStep] = useState(0)

  const [name, setName] = useState(profile?.display_name ?? '')
  const [currency, setCurrency] = useState(profile?.base_currency ?? 'EUR')
  // Payment details are write-only from here (encrypted at rest); onboarding is
  // first-run, so there's nothing to prefill.
  const [iban, setIban] = useState('')
  const [revolut, setRevolut] = useState('')
  const [groupName, setGroupName] = useState('')
  const [pushDone, setPushDone] = useState(false)
  const [passkeyDone, setPasskeyDone] = useState(false)

  const { busy, run } = useAsyncSubmit()

  const STEPS = ['Welcome', 'Getting paid', 'Stay in the loop']
  const isLast = step === STEPS.length - 1

  // Finishing or dismissing both end the wizard the same way: persist the flag
  // (+ suppress the standalone prompts this session) and hand control back.
  async function finish() {
    try {
      await updateProfile(user.id, { onboarded_at: new Date().toISOString() })
    } catch { /* non-fatal — App still unmounts us via the realtime refetch */ }
    // The wizard already covered these, so don't let the separate prompts re-ask.
    try {
      sessionStorage.setItem('budge:passkeyPrompted', '1')
      localStorage.setItem('budge:notifPrompted', '1')
    } catch { /* private mode */ }
    window.dispatchEvent(new Event(EVENTS.profileUpdated))
    onDone?.()
  }

  async function saveBasics() {
    await run(async () => {
      await updateProfile(user.id, { display_name: name.trim() || null, base_currency: currency })
      window.dispatchEvent(new Event(EVENTS.profileUpdated))
      setStep(1)
    }, { errorTitle: 'Couldn’t save your details' })
  }

  async function savePaymentAndGroup() {
    await run(async () => {
      await savePaymentInfo({
        iban: iban.replace(/\s+/g, '').toUpperCase() || null,
        revolut: revolut.replace(/^@/, '').trim() || null,
      })
      if (groupName.trim()) {
        const gid = await createGroup(groupName.trim(), currency)
        toast({ title: `Group “${groupName.trim()}” created`, status: 'success' })
        await finish()
        navigate(`/groups/${gid}`)
        return
      }
      setStep(2)
    }, { errorTitle: 'Couldn’t save' })
  }

  async function turnOnPush() {
    const status = await enablePush().catch(() => 'error')
    setPushDone(true)
    if (status === 'denied') toast({ title: 'Notifications blocked — you can enable them later in Profile', status: 'info' })
    else if (status === 'unsupported') toast({ title: 'On iPhone, install Budgeer to your home screen for push', status: 'info' })
    else if (status === 'subscribed') toast({ title: 'Notifications on', status: 'success' })
  }

  async function addPasskey() {
    const { error } = await registerPasskey()
    if (error) { toast({ title: 'Couldn’t add passkey', description: error.message, status: 'error' }); return }
    setPasskeyDone(true)
    toast({ title: 'Passkey added', status: 'success' })
  }

  return (
    <Modal isOpen onClose={finish} isCentered scrollBehavior="inside" closeOnOverlayClick={false}>
      <ModalOverlay />
      <ModalContent mx={4}>
        <ModalHeader pb={2}>
          <HStack justify="space-between" align="start">
            <Logo size={26} />
            <IconButton aria-label="Skip setup" size="sm" variant="ghost"
              icon={<X size={18} />} onClick={finish} />
          </HStack>
          <Progress value={((step + 1) / STEPS.length) * 100} size="xs"
            colorScheme="brand" borderRadius="full" mt={3} />
        </ModalHeader>

        <ModalBody>
          {step === 0 && (
            <Stack spacing={4}>
              <HStack color="accent.fg"><Sparkles size={18} /><Heading size="sm">Welcome to Budgeer</Heading></HStack>
              <Text fontSize="sm" color="text.muted">
                Track your spending and split costs with friends. Let’s set up the basics —
                this takes under a minute.
              </Text>
              <FormControl>
                <FormLabel>Your name</FormLabel>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
              </FormControl>
              <FormControl>
                <FormLabel>Default currency</FormLabel>
                <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              </FormControl>
            </Stack>
          )}

          {step === 1 && (
            <Stack spacing={4}>
              <HStack color="accent.fg"><Landmark size={18} /><Heading size="sm">Getting paid & groups</Heading></HStack>
              <Text fontSize="sm" color="text.muted">
                Add how friends can pay you back (shown as one-tap options when they settle up),
                and start a group if you like. All optional.
              </Text>
              <FormControl>
                <FormLabel>IBAN</FormLabel>
                <Input value={iban} onChange={(e) => setIban(e.target.value)}
                  placeholder="CY17 0020 0128 …" autoComplete="off" />
              </FormControl>
              <FormControl>
                <FormLabel>Revolut tag</FormLabel>
                <Input value={revolut} onChange={(e) => setRevolut(e.target.value)}
                  placeholder="@yourtag" autoComplete="off" />
              </FormControl>
              <FormControl>
                <FormLabel><HStack spacing={2}><Users size={14} /><Text>Name your first group (optional)</Text></HStack></FormLabel>
                <Input value={groupName} onChange={(e) => setGroupName(e.target.value)}
                  placeholder="Corfu trip, Flatmates…" />
              </FormControl>
            </Stack>
          )}

          {step === 2 && (
            <Stack spacing={4}>
              <HStack color="accent.fg"><BellRing size={18} /><Heading size="sm">Stay in the loop</Heading></HStack>
              <Text fontSize="sm" color="text.muted">
                Get a nudge when friends add expenses or bills are due, and sign in faster next time.
              </Text>
              <Button variant={pushDone ? 'outline' : 'solid'} leftIcon={<BellRing size={16} />}
                onClick={turnOnPush} isDisabled={pushDone || !pushSupported()}>
                {pushDone ? 'Notifications set' : 'Enable notifications'}
              </Button>
              {passkeysSupported && (
                <Button variant={passkeyDone ? 'outline' : 'solid'} leftIcon={<KeyRound size={16} />}
                  onClick={addPasskey} isDisabled={passkeyDone}>
                  {passkeyDone ? 'Passkey added' : 'Add a passkey'}
                </Button>
              )}
              <Text fontSize="xs" color="text.muted">You can change both anytime in Profile.</Text>
            </Stack>
          )}
        </ModalBody>

        <ModalFooter gap={2}>
          {step > 0 && (
            <Button variant="ghost" leftIcon={<ArrowLeft size={16} />}
              onClick={() => setStep(step - 1)} isDisabled={busy}>Back</Button>
          )}
          <Box flex="1" />
          {!isLast && (
            <Button variant="ghost" onClick={() => setStep(step + 1)} isDisabled={busy}>Skip</Button>
          )}
          {step === 0 && (
            <Button rightIcon={<ArrowRight size={16} />} isLoading={busy} onClick={saveBasics}>Continue</Button>
          )}
          {step === 1 && (
            <Button rightIcon={<ArrowRight size={16} />} isLoading={busy} onClick={savePaymentAndGroup}>Continue</Button>
          )}
          {isLast && (
            <Button isLoading={busy} onClick={() => run(finish, { errorTitle: 'Couldn’t finish' })}>
              Finish
            </Button>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
