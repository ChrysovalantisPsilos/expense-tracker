import { useEffect, useRef, useState } from 'react'
import {
  Stack, HStack, Button, FormControl, FormHelperText, SimpleGrid, FormLabel,
  Input, Select, useToast, Text, IconButton, Box,
} from '@chakra-ui/react'
import { Camera, UserRound } from 'lucide-react'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { useProfile } from '../../shared/lib/ProfileProvider.jsx'
import { baseCurrencyLocked, getProfile, updateProfile, uploadAvatar } from '../../shared/lib/profile.js'
import { CURRENCIES } from '../../shared/lib/currency.js'
import { EVENTS } from '../../shared/lib/keys.js'
import UserAvatar from '../../shared/ui/UserAvatar.jsx'
import Panel from '../../shared/ui/kit/Panel.jsx'
import { useAsyncSubmit } from '../../shared/lib/useAsyncSubmit.js'
import SettingsPage from './SettingsPage.jsx'
import PaymentCard from './PaymentCard.jsx'
import { userMessage } from '../../shared/lib/errors.js'
import RingLoader from '../../shared/ui/RingLoader.jsx'

export default function AccountSettings() {
  const { user } = useAuth()
  return (
    <SettingsPage title="Account">
      <IdentityCard user={user} />
      <PaymentCard user={user} />
    </SettingsPage>
  )
}

// Name, photo and default currency. The currency is fixed once the account
// has entries (0078): each one's exchange rate is to the currency it was
// saved in, so switching would misprice everything already there.
function IdentityCard({ user }) {
  const toast = useToast()
  // The shared demo login (0090) can't upload a photo (storage refuses it).
  const { isDemo } = useProfile()
  const fileRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [displayName, setDisplayName] = useState('')
  const [currency, setCurrency] = useState('EUR')
  const [currencyLocked, setCurrencyLocked] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState('')
  const { busy, run } = useAsyncSubmit()
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    let active = true
    // If the lock can't be read, the picker stays and the server has the
    // last word (its refusal is shown as the save error).
    Promise.all([getProfile(user.id), baseCurrencyLocked().catch(() => false)]).then(([data, locked]) => {
      if (!active || !data) return
      setDisplayName(data.display_name ?? '')
      setCurrency(data.base_currency ?? 'EUR')
      setCurrencyLocked(locked)
      setAvatarUrl(data.avatar_url ?? '')
      setLoading(false)
    })
    return () => { active = false }
  }, [user.id])

  async function save(e) {
    e.preventDefault()
    await run(async () => {
      await updateProfile(user.id, {
        display_name: displayName || null,
        ...(currencyLocked ? {} : { base_currency: currency }),
      })
      // Nudge live consumers (nav bar) to refetch the new name/avatar at once.
      window.dispatchEvent(new Event(EVENTS.profileUpdated))
      toast({ title: 'Profile saved', status: 'success' })
    })
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
    } catch (e) {
      console.error('[settings] avatar upload failed:', e)
      toast({ title: userMessage(e, 'Couldn’t update your photo. Please try again.'), status: 'error' })
    } finally { setUploading(false) }
  }

  if (loading) {
    return <Panel title="Profile" icon={UserRound}><RingLoader /></Panel>
  }

  return (
    <Panel title="Profile" icon={UserRound}>
      <Stack spacing={5} as="form" onSubmit={save}>
        <HStack spacing={4} minW={0}>
          <Box position="relative" flexShrink={0}>
            <UserAvatar size="xl" name={displayName} src={avatarUrl} highlight />
            {!isDemo && (
              <>
                <IconButton aria-label="Change photo" icon={<Camera size={16} />}
                  size="sm" borderRadius="full" position="absolute" bottom="-4px" right="-4px"
                  isLoading={uploading} onClick={() => fileRef.current?.click()} />
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={onAvatar} />
              </>
            )}
          </Box>
          <Stack spacing={0} flex="1" minW={0}>
            <Text fontWeight="700" overflowWrap="anywhere">{displayName || 'Your name'}</Text>
            <Text fontSize="sm" color="text.muted" overflowWrap="anywhere">{user.email}</Text>
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
            {currencyLocked ? (
              <>
                <Input value={currency} isReadOnly />
                <FormHelperText>
                  Your base currency is fixed once you’ve added entries, so past amounts stay
                  correct. To start over in another currency, export your data and create a new
                  account.
                </FormHelperText>
              </>
            ) : (
              <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            )}
          </FormControl>
        </SimpleGrid>

        <Button type="submit" alignSelf="start" isLoading={busy}>Save changes</Button>
      </Stack>
    </Panel>
  )
}
