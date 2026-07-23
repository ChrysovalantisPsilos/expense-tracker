import { useRegisterSW } from 'virtual:pwa-register/react'
import { Box, Button, HStack, Text, Slide } from '@chakra-ui/react'

// How often an open, visible tab re-checks for a new deploy. The check is a
// conditional fetch of sw.js (304 from the CDN when unchanged) — cheap enough
// to keep the update prompt effectively realtime.
const UPDATE_CHECK_MS = 60 * 1000

// Shows a small toast when a new app version has been deployed. Clicking Update
// activates the waiting service worker and reloads onto the fresh bundle — so a
// deploy never surfaces as a stale-cache error. The browser only checks for a
// new worker on navigation by default, so an open tab (or installed PWA) would
// never see the prompt — we re-check on an interval while visible, on tab
// focus, and on reconnect.
export default function ReloadPrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return
      const check = () => {
        if (document.visibilityState === 'visible') registration.update().catch(() => {})
      }
      setInterval(check, UPDATE_CHECK_MS)
      document.addEventListener('visibilitychange', check)
      window.addEventListener('online', check)
    },
  })

  return (
    <Slide direction="bottom" in={needRefresh} style={{ zIndex: 2000 }} unmountOnExit>
      <Box px={4} pb="calc(env(safe-area-inset-bottom) + 16px)" pt={0}>
        <HStack
          maxW="480px" mx="auto" bg="bg.surface" borderWidth="1px"
          borderColor="border.default" borderRadius="xl" boxShadow="lg"
          px={4} py={3} spacing={3}
        >
          <Text fontSize="sm" flex="1">A new version of Budge is available.</Text>
          <Button size="sm" variant="ghost" onClick={() => setNeedRefresh(false)}>Later</Button>
          <Button size="sm" onClick={() => updateServiceWorker(true)}>Update</Button>
        </HStack>
      </Box>
    </Slide>
  )
}
