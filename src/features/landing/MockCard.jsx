import { Box, Text } from '@chakra-ui/react'

// App-style card that frames each feature-showcase mini mockup. Decorative:
// the visible numbers are demo data, so assistive tech gets `label` instead.
export default function MockCard({ title, label, playbackRef, children }) {
  return (
    <Box ref={playbackRef} role="img" aria-label={label} w="full" maxW="420px" mx="auto"
      bg="bg.surface" borderWidth="1px" borderColor="border.default"
      borderRadius="2xl" boxShadow="lifted" p={{ base: 4, md: 5 }}>
      <Box aria-hidden>
        <Text fontFamily="heading" fontWeight="700" mb={4}>{title}</Text>
        {children}
      </Box>
    </Box>
  )
}
