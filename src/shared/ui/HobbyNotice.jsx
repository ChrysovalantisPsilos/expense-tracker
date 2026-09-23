import { Box, HStack, Text } from '@chakra-ui/react'
import { Info } from 'lucide-react'
import IconTile from './kit/IconTile.jsx'
import { HOBBY_NOTICE, HOBBY_NOTICE_TITLE } from '../lib/disclaimer.js'

// The highlighted "free hobby project" box at the top of Help & FAQ, the
// Privacy Notice and the Terms of Use.
export default function HobbyNotice() {
  return (
    <Box as="aside" aria-label={HOBBY_NOTICE_TITLE} bg="bg.subtle" borderWidth="1px"
      borderColor="border.default" borderLeftWidth="4px" borderLeftColor="brand.500"
      borderRadius="xl" p={{ base: 4, md: 5 }}>
      <HStack spacing={3} align="flex-start">
        <IconTile icon={Info} size={36} radius="lg" bg="bg.surface" />
        <Box minW={0}>
          <Text fontFamily="heading" fontWeight="700" lineHeight="1.4">{HOBBY_NOTICE_TITLE}</Text>
          <Text color="text.muted" lineHeight="1.7" mt={1}>{HOBBY_NOTICE}</Text>
        </Box>
      </HStack>
    </Box>
  )
}
