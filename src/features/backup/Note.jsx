import { Box, HStack, Text } from '@chakra-ui/react'

// A quiet callout inside the backup cards and dialogs: an icon and a short
// explanation on a sand tile. `tone="warning"` tints the icon amber.
export default function Note({ icon: Icon, tone, children }) {
  return (
    <HStack align="start" spacing={3} bg="bg.subtle" borderRadius="lg" px={3} py={2.5}>
      <Box color={tone === 'warning' ? 'status.warning' : 'accent.fg'} mt={0.5} flexShrink={0}>
        <Icon size={16} />
      </Box>
      <Text fontSize="sm" color="text.primary" minW={0}>{children}</Text>
    </HStack>
  )
}
