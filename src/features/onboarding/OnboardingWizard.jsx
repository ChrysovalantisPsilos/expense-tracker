import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Stack, HStack, Text, Heading, FormControl, FormHelperText, FormLabel, Input, Select, Button,
  IconButton, Progress, Box, useToast,
} from '@chakra-ui/react'
import { X, ArrowRight, ArrowLeft, Sparkles, Users, BellRing, KeyRound, Compass } from 'lucide-react'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { passkeysSupported } from '../../shared/lib/supabase.js'
import { CURRENCIES } from '../../shared/lib/currency.js'
import { EVENTS, STORAGE_KEYS } from '../../shared/lib/keys.js'
import { enablePush, pushSupported } from '../../shared/lib/push.js'
import { useAsyncSubmit } from '../../shared/lib/useAsyncSubmit.js'
import { updateProfile } from '../../shared/lib/profile.js'
import { SHORT_LANDSCAPE } from '../../shared/lib/shortLandscape.js'
import { createGroup } from '../groups/groups.js'
import Logo from '../../shared/ui/Logo.jsx'
import { startTour } from './tour.js'
import { userMessage } from '../../shared/lib/errors.js'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

// The wizard's steps: welcome, first group, stay in the loop, look around.
const STEP_COUNT = 4

// Post-signup setup wizard. Shows once per account (App gates on
// profiles.onboarded_at). Collects the essentials, folds in the notification +
// passkey asks so they don't fire separately, and every step is skippable —
// payment details are asked later, in Settle up, the first time someone owes
// you (groups/PaymentDetailsAsk) —
// closing at any point stamps onboarded_at so it never nags again. Its last
// step hands over to the app tour (ProductTour); skipping that, or closing
// the wizard early, marks the tour seen too (profiles.tour_done).
export default function OnboardingWizard({ profile, onDone }) {
  const t = useT('onboarding')
  const { user, registerPasskey } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [step, setStep] = useState(0)
  const [open, setOpen] = useState(true)

  const [name, setName] = useState(profile?.display_name ?? '')
  const [currency, setCurrency] = useState(profile?.base_currency ?? 'EUR')
  const [groupName, setGroupName] = useState('')
  const [pushDone, setPushDone] = useState(false)
  const [passkeyDone, setPasskeyDone] = useState(false)
  const [groupPath, setGroupPath] = useState(null) // the group made on step 1, if any

  const { busy, run } = useAsyncSubmit()

  const isLast = step === STEP_COUNT - 1

  // Each step opens on its field (not the close button): the name first,
  // then the group name.
  const nameRef = useRef(null)
  const groupRef = useRef(null)
  useEffect(() => {
    if (step === 1) groupRef.current?.focus()
  }, [step])

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
      localStorage.setItem(STORAGE_KEYS.notifPrompted, '1')
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
    }, { errorTitle: t('wizard.welcome.failed') })
  }

  async function saveGroup() {
    await run(async () => {
      if (groupName.trim()) {
        const gid = await createGroup(groupName.trim(), currency)
        toast({ title: t('wizard.group.created', { name: groupName.trim() }), status: 'success' })
        setGroupPath(`/groups/${gid}`)
        setGroupName('')
      }
      setStep(2)
    }, { errorTitle: t('common:errors.notSaved') })
  }

  async function turnOnPush() {
    const status = await enablePush().catch(() => 'error')
    setPushDone(true)
    if (status === 'denied') toast({ title: t('wizard.loop.blocked'), status: 'info' })
    else if (status === 'unsupported') toast({ title: t('wizard.loop.iphone'), status: 'info' })
    else if (status === 'subscribed') toast({ title: t('wizard.loop.on'), status: 'success' })
  }

  async function addPasskey() {
    const { error } = await registerPasskey()
    if (error) {
      console.error('[onboarding] passkey not added:', error)
      toast({ title: t('settings:passkeys.addFailed'), description: userMessage(error), status: 'error' })
      return
    }
    setPasskeyDone(true)
    toast({ title: t('settings:passkeys.added'), status: 'success' })
  }

  return (
    <Modal isOpen={open} onClose={() => finish()} isCentered scrollBehavior="inside" closeOnOverlayClick={false}
      initialFocusRef={nameRef}>
      <ModalOverlay />
      <ModalContent mx={4}>
        <ModalHeader pb={2}>
          <HStack justify="space-between" align="start">
            <Logo size={26} />
            <IconButton aria-label={t('wizard.skipSetup')} size="sm" variant="ghost"
              icon={<X size={18} />} onClick={() => finish()} />
          </HStack>
          <Progress value={((step + 1) / STEP_COUNT) * 100} size="xs" mt={3} />
        </ModalHeader>

        {/* One height for every step, so the buttons don’t jump about (except
            on a phone held sideways, where the body scrolls instead). */}
        <ModalBody minH="340px" sx={{ [SHORT_LANDSCAPE]: { minH: 0 } }}>
          {step === 0 && (
            <Stack spacing={4}>
              <HStack color="accent.fg"><Sparkles size={18} /><Heading size="sm">{t('wizard.welcome.title')}</Heading></HStack>
              <Text fontSize="sm" color="text.muted">{t('wizard.welcome.lead')}</Text>
              <FormControl>
                <FormLabel>{t('settings:yourName')}</FormLabel>
                <Input ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('settings:yourName')}
                  autoComplete="name" />
              </FormControl>
              <FormControl>
                <FormLabel>{t('settings:account.currency')}</FormLabel>
                <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
                <FormHelperText>{t('wizard.welcome.currencyHelp')}</FormHelperText>
              </FormControl>
            </Stack>
          )}

          {step === 1 && (
            <Stack spacing={4}>
              <HStack color="accent.fg"><Users size={18} /><Heading size="sm">{t('wizard.group.title')}</Heading></HStack>
              <Text fontSize="sm" color="text.muted">{t('wizard.group.lead')}</Text>
              <FormControl>
                <FormLabel>{t('wizard.group.label')}</FormLabel>
                <Input ref={groupRef} value={groupName} onChange={(e) => setGroupName(e.target.value)}
                  placeholder={t('wizard.group.placeholder')} />
              </FormControl>
            </Stack>
          )}

          {step === 2 && (
            <Stack spacing={4}>
              <HStack color="accent.fg"><BellRing size={18} /><Heading size="sm">{t('wizard.loop.title')}</Heading></HStack>
              <Text fontSize="sm" color="text.muted">{t('wizard.loop.lead')}</Text>
              <Button variant="outline" leftIcon={<BellRing size={16} />}
                onClick={turnOnPush} isDisabled={pushDone || !pushSupported()}>
                {pushDone ? t('wizard.loop.enabled') : t('wizard.loop.enable')}
              </Button>
              {passkeysSupported && (
                <Button variant="outline" leftIcon={<KeyRound size={16} />}
                  onClick={addPasskey} isDisabled={passkeyDone}>
                  {passkeyDone ? t('settings:passkeys.added') : t('wizard.loop.addPasskey')}
                </Button>
              )}
              <Text fontSize="xs" color="text.muted">{t('wizard.loop.later')}</Text>
            </Stack>
          )}

          {step === 3 && (
            <Stack spacing={4}>
              <HStack color="accent.fg"><Compass size={18} /><Heading size="sm">{t('wizard.tour.title')}</Heading></HStack>
              <Text fontSize="sm" color="text.muted">{t('wizard.tour.lead')}</Text>
            </Stack>
          )}
        </ModalBody>

        <ModalFooter gap={2}>
          {step > 0 && (
            <Button variant="ghost" leftIcon={<ArrowLeft size={16} />}
              onClick={() => setStep(step - 1)} isDisabled={busy}>{t('wizard.back')}</Button>
          )}
          <Box flex="1" />
          {step < 2 && (
            <Button variant="ghost" onClick={() => setStep(step + 1)} isDisabled={busy}>{t('wizard.skip')}</Button>
          )}
          {step === 0 && (
            <Button rightIcon={<ArrowRight size={16} />} isLoading={busy} onClick={saveBasics}>{t('wizard.continue')}</Button>
          )}
          {step === 1 && (
            <Button rightIcon={<ArrowRight size={16} />} isLoading={busy} onClick={saveGroup}>{t('wizard.continue')}</Button>
          )}
          {step === 2 && (
            <Button rightIcon={<ArrowRight size={16} />} onClick={() => setStep(3)}>{t('wizard.continue')}</Button>
          )}
          {isLast && (
            <>
              <Button variant="ghost" isDisabled={busy} onClick={() => run(finish, { errorTitle: t('wizard.finishFailed') })}>
                {t('wizard.tour.skip')}
              </Button>
              <Button isLoading={busy} rightIcon={<ArrowRight size={16} />}
                onClick={() => run(() => finish({ tour: true }), { errorTitle: t('wizard.finishFailed') })}>
                {t('wizard.tour.start')}
              </Button>
            </>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
