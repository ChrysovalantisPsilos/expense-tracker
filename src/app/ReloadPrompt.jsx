import { useRegisterSW } from 'virtual:pwa-register/react'
import { Box, Button, HStack, Text, Slide } from '@chakra-ui/react'

// Shows a small toast when a new app version has been deployed. Clicking Update
// activates the waiting service worker and reloads onto the fresh bundle — so a
// deploy never surfaces as a stale-cache error.
export default function ReloadPrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

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
