import { useEffect, useRef, useState } from 'react'
import {
  Heading, Stack, Card, CardBody, HStack, Button, FormControl, SimpleGrid,
  FormLabel, Input, Select, useToast, Center, Spinner, Text, IconButton, Box,
  Divider, Spacer, Flex, useDisclosure, Modal, ModalOverlay, ModalContent,
  ModalHeader, ModalBody, ModalFooter, Switch,
} from '@chakra-ui/react'
import {
  Camera, KeyRound, Trash2, Plus, AlertTriangle, Sun, Moon, Monitor, BellRing,
  Landmark,
} from 'lucide-react'
import { supabase, passkeysSupported, edgeFunctionError } from '../../shared/lib/supabase.js'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { useAppearance } from '../../shared/lib/appearance.jsx'
import { enablePush } from '../../shared/lib/push.js'
import { updateProfile, uploadAvatar } from './profile.js'
import { CURRENCIES } from '../../shared/lib/currency.js'
import { EVENTS } from '../../shared/lib/keys.js'
import UserAvatar from '../../shared/ui/UserAvatar.jsx'
import ReportsCard from './ReportsCard.jsx'

export default function Profile() {
  const { user, signOut, listPasskeys, registerPasskey, deletePasskey } = useAuth()
  const toast = useToast()
  const deleteModal = useDisclosure()
  const fileRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [displayName, setDisplayName] = useState('')
  const [currency, setCurrency] = useState('EUR')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [passkeys, setPasskeys] = useState(null) // null = not loaded / unsupported
  const [pkBusy, setPkBusy] = useState(false)

  useEffect(() => {
    let active = true
    supabase.from('profiles').select('*').eq('id', user.id).single().then(({ data }) => {
      if (!active || !data) return
      setDisplayName(data.display_name ?? '')
      setCurrency(data.base_currency ?? 'EUR')
      setAvatarUrl(data.avatar_url ?? '')
      setLoading(false)
    })
    return () => { active = false }
  }, [user.id])

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    try {
      await updateProfile(user.id, {
        display_name: displayName || null,
        base_currency: currency,
      })
      // Nudge live consumers (nav bar) to refetch the new name/avatar at once.
      window.dispatchEvent(new Event(EVENTS.profileUpdated))
      toast({ title: 'Profile saved', status: 'success' })
    } catch (e) { toast({ title: e.message, status: 'error' }) }
    finally { setBusy(false) }
  }

  async function loadPasskeys() {
    if (!passkeysSupported) return
    const { data, error } = await listPasskeys()
    if (error) { setPasskeys(null); return } // not enabled server-side
    setPasskeys(Array.isArray(data) ? data : (data?.passkeys ?? []))
  }
  useEffect(() => { loadPasskeys() /* eslint-disable-next-line */ }, [])

  async function addPasskey() {
    setPkBusy(true)
    const { error } = await registerPasskey()
    setPkBusy(false)
    if (error) { toast({ title: 'Couldn’t add passkey', description: error.message, status: 'error' }); return }
    toast({ title: 'Passkey added', status: 'success' })
    loadPasskeys()
  }

  async function removePasskey(id) {
    const { error } = await deletePasskey(id)
    if (error) { toast({ title: error.message, status: 'error' }); return }
    loadPasskeys()
  }

  async function onAvatar(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadAvatar(user.id, file)
      setAvatarUrl(url)
      toast({ title: 'Photo updated', status: 'success' })
    } catch (e) { toast({ title: e.message, status: 'error' }) }
    finally { setUploading(false) }
  }

  if (loading) return <Center py={20}><Spinner color="brand.500" /></Center>

  return (
    <Stack spacing={5} maxW="640px" mx="auto" w="full">
      <Heading size="lg">Profile</Heading>

      {/* Identity — fields side-by-side within the column */}
      <Card><CardBody>
        <Stack spacing={5} as="form" onSubmit={save}>
          <HStack spacing={4}>
            <Box position="relative">
              <UserAvatar size="xl" name={displayName} src={avatarUrl} highlight />
              <IconButton aria-label="Change photo" icon={<Camera size={16} />}
                size="sm" borderRadius="full" position="absolute" bottom="-4px" right="-4px"
                isLoading={uploading} onClick={() => fileRef.current?.click()} />
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={onAvatar} />
            </Box>
            <Stack spacing={0}>
              <Text fontWeight="700">{displayName || 'Your name'}</Text>
              <Text fontSize="sm" color="text.muted">{user.email}</Text>
            </Stack>
          </HStack>

          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
            <FormControl>
              <FormLabel>Name</FormLabel>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name" />
            </FormControl>
            <FormControl>
              <FormLabel>Default currency</FormLabel>
              <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </FormControl>
          </SimpleGrid>

          <Button type="submit" alignSelf="start" isLoading={busy}>Save changes</Button>
        </Stack>
      </CardBody></Card>

      {/* Settings — single centered column, no ragged gaps */}
      <NotificationsCard user={user} />
      <PaymentCard user={user} />
      <AppearanceCard />
      <ReportsCard />
      {passkeysSupported && (
        <Card><CardBody>
            <HStack mb={3}>
              <Flex boxSize="32px" align="center" justify="center" borderRadius="lg"
                bg="bg.subtle" color="accent.fg"><KeyRound size={18} /></Flex>
              <Heading size="sm">Passkeys</Heading>
              <Spacer />
              <Button size="sm" leftIcon={<Plus size={14} />} isLoading={pkBusy}
                onClick={addPasskey}>Add</Button>
            </HStack>
            {passkeys === null ? (
              <Text fontSize="sm" color="text.muted">
                Passkeys aren’t enabled for this project yet. Turn them on in
                Supabase → Authentication → Passkeys.
              </Text>
            ) : passkeys.length === 0 ? (
              <Text fontSize="sm" color="text.muted">
                No passkeys yet. Add one to sign in with Face ID, Touch ID, or your
                device PIN — no password needed.
              </Text>
            ) : (
              <Stack spacing={0}>
                {passkeys.map((pk, i) => (
                  <Box key={pk.id}>
                    {i > 0 && <Divider />}
                    <HStack py={2}>
                      <KeyRound size={16} />
                      <Stack spacing={0}>
                        <Text fontSize="sm" fontWeight="600">{pk.friendly_name || 'Passkey'}</Text>
                        {pk.created_at && (
                          <Text fontSize="xs" color="text.muted">
                            added {String(pk.created_at).slice(0, 10)}
                          </Text>
                        )}
                      </Stack>
                      <Spacer />
                      <IconButton aria-label="Remove passkey" size="sm" variant="ghost"
                        icon={<Trash2 size={16} />} onClick={() => removePasskey(pk.id)} />
                    </HStack>
                  </Box>
                ))}
              </Stack>
            )}
          </CardBody></Card>
      )}

      <Card borderColor="red.200" _dark={{ borderColor: 'red.800' }}><CardBody>
        <HStack mb={2}>
          <Flex boxSize="32px" align="center" justify="center" borderRadius="lg"
            bg="red.50" color="red.500" _dark={{ bg: 'whiteAlpha.100' }}>
            <AlertTriangle size={18} />
          </Flex>
          <Heading size="sm">Delete account</Heading>
        </HStack>
        <Text fontSize="sm" color="text.muted" mb={3}>
          Permanently deletes your account and personal data. Groups you own pass
          to another member; your expense history stays for them. This can’t be undone.
        </Text>
        <Button colorScheme="red" variant="outline" leftIcon={<Trash2 size={16} />}
          onClick={deleteModal.onOpen}>Delete my account</Button>
      </CardBody></Card>

      <DeleteAccountModal user={user} isOpen={deleteModal.isOpen} onClose={deleteModal.onClose}
        signOut={signOut} />
    </Stack>
  )
}

function NotificationsCard({ user }) {
  const toast = useToast()
  const [prefs, setPrefs] = useState(null) // { notify_email, notify_push }

  useEffect(() => {
    let active = true
    supabase.from('profiles').select('notify_email, notify_push')
      .eq('id', user.id).single().then(({ data }) => {
        if (active && data) setPrefs(data)
      })
    return () => { active = false }
  }, [user.id])

  async function setPref(field, value) {
    const prev = prefs
    setPrefs({ ...prefs, [field]: value }) // optimistic
    try {
      await updateProfile(user.id, { [field]: value })
      // Turning push on is the moment to enrol this device (user gesture).
      if (field === 'notify_push' && value) {
        const status = await enablePush()
        if (status === 'denied') {
          toast({ title: 'This browser blocks notifications', status: 'info',
            description: 'Allow them in your browser settings to get push here. Other devices are unaffected.' })
        } else if (status === 'unsupported') {
          toast({ title: 'Push isn’t available in this browser', status: 'info',
            description: 'On iPhone, install Budgeer to your home screen first.' })
        }
      }
    } catch (e) {
      setPrefs(prev)
      toast({ title: 'Couldn’t save', description: e.message, status: 'error' })
    }
  }

  return (
    <Card><CardBody>
      <HStack mb={3}>
        <Flex boxSize="32px" align="center" justify="center" borderRadius="lg"
          bg="bg.subtle" color="accent.fg"><BellRing size={18} /></Flex>
        <Heading size="sm">Notifications</Heading>
      </HStack>
      {prefs === null ? (
        <Center py={4}><Spinner size="sm" color="brand.500" /></Center>
      ) : (
        <Stack spacing={4}>
          <HStack justify="space-between" align="start">
            <Stack spacing={0}>
              <Text fontSize="sm" fontWeight="600">Push notifications</Text>
              <Text fontSize="xs" color="text.muted">
                Group activity and payment reminders, on every device you’ve allowed.
              </Text>
            </Stack>
            <Switch colorScheme="brand" isChecked={prefs.notify_push}
              onChange={(e) => setPref('notify_push', e.target.checked)} />
          </HStack>
          <HStack justify="space-between" align="start">
            <Stack spacing={0}>
              <Text fontSize="sm" fontWeight="600">Email me</Text>
              <Text fontSize="xs" color="text.muted">
                Big events only: group invites, members joining or leaving.
              </Text>
            </Stack>
            <Switch colorScheme="brand" isChecked={prefs.notify_email}
              onChange={(e) => setPref('notify_email', e.target.checked)} />
          </HStack>
        </Stack>
      )}
    </CardBody></Card>
  )
}

function PaymentCard({ user }) {
  const toast = useToast()
  const [iban, setIban] = useState('')
  const [revolut, setRevolut] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    supabase.from('profiles').select('payment_iban, payment_revolut')
      .eq('id', user.id).single().then(({ data }) => {
        if (!active || !data) return
        setIban(data.payment_iban ?? '')
        setRevolut(data.payment_revolut ?? '')
        setLoaded(true)
      })
    return () => { active = false }
  }, [user.id])

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    try {
      await updateProfile(user.id, {
        payment_iban: iban.replace(/\s+/g, '').toUpperCase() || null,
        payment_revolut: revolut.replace(/^@/, '').trim() || null,
      })
      toast({ title: 'Payment details saved', status: 'success' })
    } catch (e) { toast({ title: e.message, status: 'error' }) }
    finally { setBusy(false) }
  }

  return (
    <Card><CardBody>
      <HStack mb={3}>
        <Flex boxSize="32px" align="center" justify="center" borderRadius="lg"
          bg="bg.subtle" color="accent.fg"><Landmark size={18} /></Flex>
        <Heading size="sm">Getting paid</Heading>
      </HStack>
      <Text fontSize="sm" color="text.muted" mb={3}>
        Friends settling up with you see these as one-tap payment options —
        a bank QR for your IBAN and a Revolut link.
      </Text>
      {!loaded ? (
        <Center py={3}><Spinner size="sm" color="brand.500" /></Center>
      ) : (
        <Stack spacing={3} as="form" onSubmit={save}>
          <FormControl>
            <FormLabel>IBAN</FormLabel>
            <Input value={iban} onChange={(e) => setIban(e.target.value)}
              placeholder="CY17 0020 0128 ..." autoComplete="off" />
          </FormControl>
          <FormControl>
            <FormLabel>Revolut tag</FormLabel>
            <Input value={revolut} onChange={(e) => setRevolut(e.target.value)}
              placeholder="@yourtag" autoComplete="off" />
          </FormControl>
          <Button type="submit" size="sm" alignSelf="start" isLoading={busy}>Save</Button>
        </Stack>
      )}
    </CardBody></Card>
  )
}

const APPEARANCE_OPTIONS = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

function AppearanceCard() {
  const { pref, setPref } = useAppearance()
  return (
    <Card><CardBody>
      <HStack mb={3}>
        <Flex boxSize="32px" align="center" justify="center" borderRadius="lg"
          bg="bg.subtle" color="accent.fg"><Moon size={18} /></Flex>
        <Heading size="sm">Appearance</Heading>
      </HStack>
      <Text fontSize="sm" color="text.muted" mb={3}>
        Choose your theme. “System” follows your device and switches automatically.
      </Text>
      <SimpleGrid columns={3} spacing={2}>
        {APPEARANCE_OPTIONS.map(({ value, label, icon: Icon }) => {
          const active = pref === value
          return (
            <Button key={value} onClick={() => setPref(value)} variant="outline"
              flexDirection="column" h="auto" py={3} gap={1.5}
              borderWidth="2px"
              borderColor={active ? 'brand.500' : 'border.default'}
              color={active ? 'accent.fg' : 'text.muted'}
              bg={active ? 'bg.subtle' : 'transparent'}
              _hover={{ bg: 'bg.subtle' }}>
              <Icon size={20} />
              <Text fontSize="xs" fontWeight="600">{label}</Text>
            </Button>
          )
        })}
      </SimpleGrid>
    </CardBody></Card>
  )
}

function DeleteAccountModal({ user, isOpen, onClose, signOut }) {
  const toast = useToast()
  const providers = user.app_metadata?.providers
    || (user.app_metadata?.provider ? [user.app_metadata.provider] : [])
  // Require a password if the user has an email/password identity (default to
  // requiring it when we can't tell); otherwise ask for a typed phrase.
  const isPasswordUser = providers.includes('email') || providers.length === 0
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
