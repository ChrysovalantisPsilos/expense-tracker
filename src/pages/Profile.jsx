import { useEffect, useRef, useState } from 'react'
import {
  Heading, Stack, Card, CardBody, HStack, Avatar, Button, FormControl,
  FormLabel, Input, Select, useToast, Center, Spinner, Text, IconButton, Box,
} from '@chakra-ui/react'
import { Camera } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../auth/AuthProvider.jsx'
import { updateProfile, uploadAvatar } from '../lib/profile.js'
import { CURRENCIES } from '../lib/currency.js'

export default function Profile() {
  const { user, signOut } = useAuth()
  const toast = useToast()
  const fileRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [displayName, setDisplayName] = useState('')
  const [nickname, setNickname] = useState('')
  const [currency, setCurrency] = useState('EUR')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)

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

      <Button variant="ghost" colorScheme="gray" onClick={signOut} alignSelf="start">
        Sign out
      </Button>
    </Stack>
  )
}
