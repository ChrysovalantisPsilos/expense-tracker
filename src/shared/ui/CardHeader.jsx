import { Box, Flex, Heading, HStack, Text } from '@chakra-ui/react'

// Heading row for a card: a sand icon tile, a Poppins title (h2), an optional
// muted subtitle, and an optional small action on the right. `icon` is a
// Lucide component. Extra props (e.g. mb) pass through to the row.
export default function CardHeader({ icon: Icon, title, subtitle, action, ...props }) {
  return (
    <HStack spacing={3} mb={4} {...props}>
      {Icon && (
        <Flex boxSize="32px" borderRadius="lg" bg="bg.subtle" color="accent.fg"
          align="center" justify="center" flexShrink={0}>
          <Icon size={16} />
        </Flex>
      )}
      <Box flex="1" minW={0}>
        <Heading as="h2" size="sm" noOfLines={1}>{title}</Heading>
        {subtitle && <Text fontSize="xs" color="text.muted" noOfLines={1}>{subtitle}</Text>}
      </Box>
      {action && <HStack spacing={1} flexShrink={0}>{action}</HStack>}
    </HStack>
  )
}
