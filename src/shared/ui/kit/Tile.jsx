import { Box } from '@chakra-ui/react'

// The sand inner tile that sits inside a Panel (balances, conversions,
// transfers). Style props override the default padding.
export default function Tile({ children, ...props }) {
  return (
    <Box bg="bg.subtle" borderRadius="lg" px={3} py={2.5} {...props}>
      {children}
    </Box>
  )
}
