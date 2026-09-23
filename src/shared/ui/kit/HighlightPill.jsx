import { Box, Text } from '@chakra-ui/react'

// A pale brand callout for the one line that matters most, with the amount
// in accent: <HighlightPill amount="€89.25">Sofia owes you</HighlightPill>.
// `amount` is optional (then it's just a highlighted sentence).
export default function HighlightPill({ children, amount, ...props }) {
  return (
    <Box borderRadius="lg" px={3} py={2} bg="brand.50" _dark={{ bg: 'whiteAlpha.100' }} {...props}>
      <Text fontSize="sm" fontWeight="600">
        {children}
        {amount && <>{' '}<Text as="span" color="accent.fg" fontWeight="800">{amount}</Text></>}
      </Text>
    </Box>
  )
}
