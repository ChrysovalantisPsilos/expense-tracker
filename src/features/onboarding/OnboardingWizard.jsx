import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Stack, HStack, Text, Heading, FormControl, FormLabel, Input, Select, Button,
  IconButton, Progress, Box, useToast,
} from '@chakra-ui/react'
import { X, ArrowRight, ArrowLeft, Sparkles, Landmark, Users, BellRing, KeyRound, Compass } from 'lucide-react'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { passkeysSupported } from '../../shared/lib/supabase.js'
import { CURRENCIES } from '../../shared/lib/currency.js'
import { EVENTS, STORAGE_KEYS } from '../../shared/lib/keys.js'
import { enablePush, pushSupported } from '../../shared/lib/push.js'
import { useAsyncSubmit } from '../../shared/lib/useAsyncSubmit.js'
import { updateProfile, savePaymentInfo } from '../../shared/lib/profile.js'
import { createGroup } from '../groups/groups.js'
import Logo from '../../shared/ui/Logo.jsx'
import { startTour } from './tour.js'

// Post-signup setup wizard. Shows once per account (App gates on
// profiles.onboarded_at). Collects the essentials, folds in the notification +
// passkey asks so they don't fire separately, and every step is skippable —
// closing at any point stamps onboarded_at so it never nags again. Its last
// step hands over to the app tour (ProductTour); skipping that, or closing
// the wizard early, marks the tour seen too (profiles.tour_done).
export default function OnboardingWizard({ profile, onDone }) {
  const { user, registerPasskey } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [step, setStep] = useState(0)
  const [open, setOpen] = useState(true)

  const [name, setName] = useState(profile?.display_name ?? '')
  const [currency, setCurrency] = useState(profile?.base_currency ?? 'EUR')
  // Payment details are write-only from here (encrypted at rest); onboarding is
  // first-run, so there's nothing to prefill.
  const [iban, setIban] = useState('')
  const [revolut, setRevolut] = useState('')
  const [groupName, setGroupName] = useState('')
  const [pushDone, setPushDone] = useState(false)
  const [passkeyDone, setPasskeyDone] = useState(false)
  const [groupPath, setGroupPath] = useState(null) // the group made on step 1, if any

  const { busy, run } = useAsyncSubmit()

  const STEPS = ['Welcome', 'Getting paid', 'Stay in the loop', 'Look around']
  const isLast = step === STEPS.length - 1

  // Finishing or dismissing both end the wizard the same way: persist the flag
  // (+ suppress the standalone prompts this session) and hand control back —
  // to the tour when `tour` is set, otherwise marking the tour seen as well.
  // A group made on the way is where things end up.
  async function finish({ tour = false } = {}) {
    setOpen(false) // release the modal's focus trap before the tour takes over
    const fields = { onboarded_at: new Date().toISOString(), ...(tour ? {} : { tour_done: true }) }
    try {
      await updateProfile(user.id, fields)
    } catch { /* non-fatal — App still unmounts us via the realtime refetch */ }
    // The wizard already covered these, so don't let the separate prompts re-ask.
    try {
      sessionStorage.setItem(STORAGE_KEYS.passkeyPrompted, '1')
      localStorage.setItem('budge:notifPrompted', '1')
    } catch { /* private mode */ }
    window.dispatchEvent(new Event(EVENTS.profileUpdated))
    if (tour) startTour({ returnTo: groupPath || '/' })
    else if (groupPath) navigate(groupPath)
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
        setGroupPath(`/groups/${gid}`)
        setGroupName('')
      }
      setStep(2)
    }, { errorTitle: 'Couldn’t save' })
  }

  async function turnOnPush() {
    const status = await enablePush().catch(() => 'error')
    setPushDone(true)
    if (status === 'denied') toast({ title: 'Notifications blocked — you can enable them later in Settings', status: 'info' })
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
    <Modal isOpen={open} onClose={() => finish()} isCentered scrollBehavior="inside" closeOnOverlayClick={false}>
      <ModalOverlay />
      <ModalContent mx={4}>
        <ModalHeader pb={2}>
          <HStack justify="space-between" align="start">
            <Logo size={26} />
            <IconButton aria-label="Skip setup" size="sm" variant="ghost"
              icon={<X size={18} />} onClick={() => finish()} />
          </HStack>
          <Progress value={((step + 1) / STEPS.length) * 100} size="xs" mt={3} />
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
              <Button variant="outline" leftIcon={<BellRing size={16} />}
                onClick={turnOnPush} isDisabled={pushDone || !pushSupported()}>
                {pushDone ? 'Notifications set' : 'Enable notifications'}
              </Button>
              {passkeysSupported && (
                <Button variant="outline" leftIcon={<KeyRound size={16} />}
                  onClick={addPasskey} isDisabled={passkeyDone}>
                  {passkeyDone ? 'Passkey added' : 'Add a passkey'}
                </Button>
              )}
              <Text fontSize="xs" color="text.muted">You can change both anytime in Settings.</Text>
            </Stack>
          )}

          {step === 3 && (
            <Stack spacing={4}>
              <HStack color="accent.fg"><Compass size={18} /><Heading size="sm">Let’s take a quick look around</Heading></HStack>
              <Text fontSize="sm" color="text.muted">
                A one-minute tour of where things are: adding expenses, groups, budgets and more.
                You can take it again any time from Settings.
              </Text>
            </Stack>
          )}
        </ModalBody>

        <ModalFooter gap={2}>
          {step > 0 && (
            <Button variant="ghost" leftIcon={<ArrowLeft size={16} />}
              onClick={() => setStep(step - 1)} isDisabled={busy}>Back</Button>
          )}
          <Box flex="1" />
          {step < 2 && (
            <Button variant="ghost" onClick={() => setStep(step + 1)} isDisabled={busy}>Skip</Button>
          )}
          {step === 0 && (
            <Button rightIcon={<ArrowRight size={16} />} isLoading={busy} onClick={saveBasics}>Continue</Button>
          )}
          {step === 1 && (
            <Button rightIcon={<ArrowRight size={16} />} isLoading={busy} onClick={savePaymentAndGroup}>Continue</Button>
          )}
          {step === 2 && (
            <Button rightIcon={<ArrowRight size={16} />} onClick={() => setStep(3)}>Continue</Button>
          )}
          {isLast && (
            <>
              <Button variant="ghost" isDisabled={busy} onClick={() => run(finish, { errorTitle: 'Couldn’t finish' })}>
                Skip tour
              </Button>
              <Button isLoading={busy} rightIcon={<ArrowRight size={16} />}
                onClick={() => run(() => finish({ tour: true }), { errorTitle: 'Couldn’t finish' })}>
                Start tour
              </Button>
            </>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
