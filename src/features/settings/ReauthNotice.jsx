import { Button, HStack, Text } from '@chakra-ui/react'
import { LogIn } from 'lucide-react'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { reauthMessage } from '../../../supabase/functions/_shared/reauth.ts'

// "Please sign in again to …" with the way to do it. Signing out on an app
// page lands on /login?next=<this page> (App's SignedOutFallback), so the user
// comes straight back here once signed in, with a fresh sign-in.
export default function ReauthNotice({ what }) {
  const { signOut } = useAuth()
  return (
    <HStack spacing={3} flexWrap="wrap" justify="space-between">
      <Text fontSize="sm" color="text.muted" flex="1" minW="200px">{reauthMessage(what)}</Text>
      <Button size="sm" leftIcon={<LogIn size={14} />} onClick={() => signOut()}>Sign in again</Button>
    </HStack>
  )
}
