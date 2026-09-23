import { Box, Text } from '@chakra-ui/react'
import { textColor } from './kitMath.js'

// A pale brand callout for the one line that matters most, with the amount
// in accent: <HighlightPill amount="€89.25">Sofia owes you</HighlightPill>.
// `amount` is optional (then it's just a highlighted sentence); `amountTone`
// recolours it (e.g. 'negative' for "You owe Alex €89.25").
export default function HighlightPill({ children, amount, amountTone = 'accent', ...props }) {
  return (
    <Box borderRadius="lg" px={3} py={2} bg="brand.50" _dark={{ bg: 'whiteAlpha.100' }} {...props}>
      <Text fontSize="sm" fontWeight="600">
        {children}
        {amount && <>{' '}<Text as="span" color={textColor(amountTone)} fontWeight="800">{amount}</Text></>}
      </Text>
    </Box>
  )
}
