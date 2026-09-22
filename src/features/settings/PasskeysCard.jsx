import { useEffect, useState } from 'react'
import {
  Card, CardBody, Stack, HStack, Box, Text, Button, IconButton, Divider, useToast,
} from '@chakra-ui/react'
import { Fingerprint, KeyRound, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { passkeysSupported } from '../../shared/lib/supabase.js'
import CardHeader from '../../shared/ui/CardHeader.jsx'
import { toPasskeyList } from './authMethods.js'

// List / add / remove passkeys. Renders nothing when this browser can't do
// WebAuthn or passkeys aren't enabled for the project (the list call errors),
// so users never see a dead feature.
export default function PasskeysCard() {
  const { listPasskeys, registerPasskey, deletePasskey } = useAuth()
  const toast = useToast()
  const [passkeys, setPasskeys] = useState(null) // null = not loaded / unsupported
  const [pkBusy, setPkBusy] = useState(false)

  async function loadPasskeys() {
    if (!passkeysSupported) return
    const { data, error } = await listPasskeys()
    if (error) { setPasskeys(null); return } // not enabled server-side
    setPasskeys(toPasskeyList(data))
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

  if (passkeys === null) return null

  return (
    <Card><CardBody>
      <CardHeader icon={Fingerprint} title="Passkeys" mb={3} action={
        <Button size="sm" leftIcon={<Plus size={14} />} isLoading={pkBusy}
          onClick={addPasskey}>Add</Button>
      } />
      {passkeys.length === 0 ? (
        <Text fontSize="sm" color="text.muted">
          No passkeys yet. Add one to sign in with Face ID, Touch ID, or your
          device PIN — no password needed.
        </Text>
      ) : (
        <Stack spacing={0} divider={<Divider />}>
          {passkeys.map((pk) => (
            <HStack key={pk.id} py={2} spacing={3}>
              <Box color="text.muted" flexShrink={0}><KeyRound size={16} /></Box>
              <Box flex="1" minW={0}>
                <Text fontSize="sm" fontWeight="600" noOfLines={1}>{pk.friendly_name || 'Passkey'}</Text>
                {pk.created_at && (
                  <Text fontSize="xs" color="text.muted">
                    added {String(pk.created_at).slice(0, 10)}
                  </Text>
                )}
              </Box>
              <IconButton aria-label="Remove passkey" size="sm" variant="ghost"
                icon={<Trash2 size={16} />} onClick={() => removePasskey(pk.id)} />
            </HStack>
          ))}
        </Stack>
      )}
    </CardBody></Card>
  )
}
