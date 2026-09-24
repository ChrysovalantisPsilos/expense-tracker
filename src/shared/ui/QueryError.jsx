import { useState } from 'react'
import { Box, Button, Stack, Text } from '@chakra-ui/react'
import { AlertCircle, RotateCw } from 'lucide-react'
import { CONNECTION_ERROR, GENERIC_ERROR, isNetworkError } from '../lib/errors.js'

// Inline "couldn't load" state with a Retry button — what a live query shows
// instead of spinning forever when its read fails. `onRetry` may return a
// promise (useLiveQuery's reload does); the button spins until it settles.
// The error's own text is never shown (useLiveQuery logs it): only offline,
// no connection, or a generic line.
export default function QueryError({ error, onRetry, what = 'this', py = 6 }) {
  const [busy, setBusy] = useState(false)
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false
  async function retry() {
    setBusy(true)
    try { await onRetry?.() } finally { setBusy(false) }
  }
  return (
    <Stack role="alert" align="center" textAlign="center" spacing={2} py={py} data-testid="query-error">
      <Box as={AlertCircle} boxSize="22px" color="status.negative" aria-hidden />
      <Text fontSize="sm" fontWeight="600">Couldn’t load {what}</Text>
      <Text fontSize="xs" color="text.muted" maxW="xs">
        {offline ? 'You’re offline. Reconnect and try again.'
          : isNetworkError(error) ? CONNECTION_ERROR : GENERIC_ERROR}
      </Text>
      {onRetry && (
        <Button size="sm" variant="outline" leftIcon={<RotateCw size={14} />} isLoading={busy} onClick={retry}>
          Retry
        </Button>
      )}
    </Stack>
  )
}
