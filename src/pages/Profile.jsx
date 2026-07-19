import { useEffect, useRef, useState } from 'react'
import {
  Heading, Stack, Card, CardBody, HStack, Avatar, Button, FormControl,
  FormLabel, Input, Select, useToast, Center, Spinner, Text, IconButton, Box,
  Divider, Spacer, Flex, useDisclosure, Modal, ModalOverlay, ModalContent,
  ModalHeader, ModalBody, ModalFooter,
} from '@chakra-ui/react'
import { Camera, KeyRound, Trash2, Plus, AlertTriangle } from 'lucide-react'
import { supabase, passkeysSupported } from '../lib/supabase.js'
import { useAuth } from '../auth/AuthProvider.jsx'
import { updateProfile, uploadAvatar } from '../lib/profile.js'
import { CURRENCIES } from '../lib/currency.js'

export default function Profile() {
  const { user, signOut, signInWithPassword, listPasskeys, registerPasskey, deletePasskey } = useAuth()
  const toast = useToast()
  const deleteModal = useDisclosure()
  const fileRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [displayName, setDisplayName] = useState('')
  const [nickname, setNickname] = useState('')
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
      setNickname(data.nickname ?? '')
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
        nickname: nickname || null,
        base_currency: currency,
      })
      // Nudge live consumers (nav bar) to refetch the new name/avatar at once.
      window.dispatchEvent(new Event('budge:profile-updated'))
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
    <Stack spacing={5} maxW="480px">
      <Heading size="lg">Profile</Heading>

      <Card><CardBody>
        <Stack spacing={5} as="form" onSubmit={save}>
          <HStack spacing={4}>
            <Box position="relative">
              <Avatar size="xl" name={displayName || nickname} src={avatarUrl} />
              <IconButton aria-label="Change photo" icon={<Camera size={16} />}
                size="sm" borderRadius="full" position="absolute" bottom="-4px" right="-4px"
                isLoading={uploading} onClick={() => fileRef.current?.click()} />
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={onAvatar} />
            </Box>
            <Stack spacing={0}>
              <Text fontWeight="700">{nickname || displayName || 'Your name'}</Text>
              <Text fontSize="sm" color="text.muted">{user.email}</Text>
            </Stack>
          </HStack>

          <FormControl>
            <FormLabel>Full name</FormLabel>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name" />
          </FormControl>
          <FormControl>
            <FormLabel>Nickname</FormLabel>
            <Input value={nickname} onChange={(e) => setNickname(e.target.value)}
              placeholder="What friends call you" />
          </FormControl>
          <FormControl>
            <FormLabel>Default currency</FormLabel>
            <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </FormControl>

          <Button type="submit" isLoading={busy}>Save changes</Button>
        </Stack>
      </CardBody></Card>

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

      <Button variant="ghost" colorScheme="gray" onClick={signOut} alignSelf="start">
        Sign out
      </Button>

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
        signInWithPassword={signInWithPassword} signOut={signOut} />
    </Stack>
  )
}

function DeleteAccountModal({ user, isOpen, onClose, signInWithPassword, signOut }) {
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
      if (isPasswordUser) {
        const { error } = await signInWithPassword(user.email, value)
        if (error) { toast({ title: 'Incorrect password', status: 'error' }); setBusy(false); return }
      }
      const { error } = await supabase.functions.invoke('delete-account')
      if (error) {
        let msg = error.message
        try { const j = await error.context?.json?.(); if (j?.error) msg = j.error } catch { /* ignore */ }
        throw new Error(msg)
      }
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
