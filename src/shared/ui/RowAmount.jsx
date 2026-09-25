import { Text } from '@chakra-ui/react'
import { landscapeOnly } from '../lib/shortLandscape.js'

// Sideways, rows sit in narrower columns (Home's stacks): a smaller minimum.
const SHORT_MIN = landscapeOnly({ minW: '64px' })

// A list row's amount column: fixed minimum width and right-aligned, so the
// figures in a list line up under each other whatever sits beside them.
// Extra props (e.g. color) pass through to the Text.
export default function RowAmount({ children, ...props }) {
  return (
    <Text fontWeight="600" textAlign="right" whiteSpace="nowrap" flexShrink={0}
      minW={{ base: '76px', sm: '104px' }} sx={SHORT_MIN} {...props}>
      {children}
    </Text>
  )
}
