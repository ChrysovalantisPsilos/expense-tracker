import { Box, HStack, Text } from '@chakra-ui/react'
import Tile from '../../shared/ui/kit/Tile.jsx'

// A quiet callout inside the backup pages: an icon and a short
// explanation on a sand tile. `tone="warning"` tints the icon amber.
export default function Note({ icon: Icon, tone, children }) {
  return (
    <Tile>
      <HStack align="start" spacing={3}>
        <Box color={tone === 'warning' ? 'status.warning' : 'accent.fg'} mt={0.5} flexShrink={0}>
          <Icon size={16} />
        </Box>
        <Text fontSize="sm" color="text.primary" minW={0}>{children}</Text>
      </HStack>
    </Tile>
  )
}
