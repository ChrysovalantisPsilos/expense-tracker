import { Button, HStack, Text } from '@chakra-ui/react'
import { LogIn } from 'lucide-react'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

// The reasons whose sentence is the server's own refusal
// (common:errors.reauth.*): the delete-account function's and start_fresh's.
const SERVER_REASONS = new Set(['deleteAccount', 'startFresh'])

// "Please sign in again to …" with the way to do it. `reason` picks the
// sentence: settings:reauth.passkeyGoogle or .passkeyGoogleDelete, or one of
// SERVER_REASONS; the English matches _shared/reauth.ts' message.
// Signing out on an app page lands on /login?next=<this page> (App's
// SignedOutFallback), so the user comes straight back here once signed in,
// with a fresh sign-in.
export default function ReauthNotice({ reason }) {
  const t = useT('settings')
  const { signOut } = useAuth()
  return (
    <HStack spacing={3} flexWrap="wrap" justify="space-between">
      <Text fontSize="sm" color="text.muted" flex="1" minW="200px">{t(SERVER_REASONS.has(reason) ? `common:errors.reauth.${reason}` : `reauth.${reason}`)}</Text>
      <Button size="sm" leftIcon={<LogIn size={14} />} onClick={() => signOut()}>{t('reauth.logInAgain')}</Button>
    </HStack>
  )
}
