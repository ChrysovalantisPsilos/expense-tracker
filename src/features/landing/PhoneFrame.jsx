import { forwardRef } from 'react'
import { Box, Flex } from '@chakra-ui/react'

// Inner cards of the phone screen: white, hairline-bordered, no shadow.
export const SCREEN_CARD = { elevation: 'none', borderRadius: 'xl', mx: 2.5, mb: 2.5 }

// A landing mock drawn as a phone: the lifted outer card, the canvas screen
// with its notch, and `children` on it. The whole phone is one decorative
// image described by `label`; its contents are hidden from assistive tech.
// Forwards its ref (usePlayback's).
const PhoneFrame = forwardRef(function PhoneFrame({ label, children }, ref) {
  return (
    <Box ref={ref} position="relative" w="full" maxW="360px" mx="auto" role="img" aria-label={label}>
      <Box bg="bg.surface" borderWidth="1px" borderColor="border.default" borderRadius="2.25rem"
        boxShadow="lifted" p={2.5}>
        <Box bg="bg.canvas" borderRadius="1.75rem" overflow="hidden" aria-hidden>
          <Flex justify="center" pt={2.5}>
            <Box w="72px" h="5px" borderRadius="full" bg="border.default" />
          </Flex>
          {children}
        </Box>
      </Box>
    </Box>
  )
})

export default PhoneFrame
