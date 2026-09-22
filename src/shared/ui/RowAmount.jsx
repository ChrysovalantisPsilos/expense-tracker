import { Text } from '@chakra-ui/react'

// A list row's amount column: fixed minimum width and right-aligned, so the
// figures in a list line up under each other whatever sits beside them.
// Extra props (e.g. color) pass through to the Text.
export default function RowAmount({ children, ...props }) {
  return (
    <Text fontWeight="600" textAlign="right" whiteSpace="nowrap" flexShrink={0}
      minW={{ base: '76px', sm: '104px' }} {...props}>
      {children}
    </Text>
  )
}
