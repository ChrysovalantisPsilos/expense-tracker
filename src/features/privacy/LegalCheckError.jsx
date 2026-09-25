import { Button, Flex, Heading, Stack, Text } from '@chakra-ui/react'
import { LogOut, RotateCw } from 'lucide-react'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { loadErrorMessage } from '../../shared/lib/errors.js'
import Logo from '../../shared/ui/Logo.jsx'
import { RingSpinner } from '../../shared/ui/RingLoader.jsx'
import { MAIN_ID } from '../../shared/ui/SkipLink.jsx'

// The legal check couldn't reach the server and this device has no record of
// the account accepting the current terms: the app stays closed (consent
// fails closed). "Try again" re-runs the check, which also happens by itself
// when the connection comes back (useLegalGate). Generic words only.
export default function LegalCheckError({ error, checking, onRetry }) {
  const { signOut } = useAuth()
  return (
    <Flex as="main" id={MAIN_ID} minH="100dvh" bg="bg.canvas" align="center" justify="center" px={4} py={10}>
      <Stack spacing={6} align="center" textAlign="center" maxW="22rem" w="full">
        <Logo size={40} />
        <Stack spacing={2} sx={{ textWrap: 'balance' }}>
          <Heading as="h1" fontSize="2xl" letterSpacing="-0.02em" lineHeight="1.2">
            We couldn’t check your account
          </Heading>
          <Text color="text.muted" role="alert">
            {loadErrorMessage(error, globalThis.navigator?.onLine)}
          </Text>
        </Stack>
        <Stack spacing={2} w="full">
          <Button size="lg" leftIcon={<RotateCw size={18} />} onClick={onRetry}
            isLoading={checking} loadingText="Checking…" spinner={<RingSpinner />}>
            Try again
          </Button>
          <Button size="lg" variant="ghost" leftIcon={<LogOut size={18} />} onClick={signOut}>
            Log out
          </Button>
        </Stack>
      </Stack>
    </Flex>
  )
}
