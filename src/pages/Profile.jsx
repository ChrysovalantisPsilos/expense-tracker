import { useEffect, useRef, useState } from 'react'
import {
  Heading, Stack, Card, CardBody, HStack, Avatar, Button, FormControl,
  FormLabel, Input, Select, useToast, Center, Spinner, Text, IconButton, Box,
  Divider, Spacer, Flex,
} from '@chakra-ui/react'
import { Camera, KeyRound, Trash2, Plus } from 'lucide-react'
import { supabase, passkeysSupported } from '../lib/supabase.js'
import { useAuth } from '../auth/AuthProvider.jsx'
import { updateProfile, uploadAvatar } from '../lib/profile.js'
import { CURRENCIES } from '../lib/currency.js'

export default function Profile() {
  const { user, signOut, listPasskeys, registerPasskey, deletePasskey } = useAuth()
  const toast = useToast()
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
    </Stack>
  )
}
