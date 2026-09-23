import { SimpleGrid, Text } from '@chakra-ui/react'
import Tile from './Tile.jsx'
import { textColor } from './kitMath.js'

// A 2-column grid of BalanceTiles (per-member balances, account totals).
export function BalanceGrid({ children, columns = 2, ...props }) {
  return <SimpleGrid columns={columns} spacing={2} {...props}>{children}</SimpleGrid>
}

// One sand tile: muted `label` over a bold `value`. For a signed balance use
// signedAmount() from kitMath for the "+€…"/"−€…" text and its `tone`.
export function BalanceTile({ label, value, tone = 'default', ...props }) {
  return (
    <Tile py={2} minW={0} {...props}>
      <Text fontSize="xs" color="text.muted" noOfLines={1}>{label}</Text>
      <Text fontSize="sm" fontWeight="700" color={textColor(tone)} whiteSpace="nowrap">{value}</Text>
    </Tile>
  )
}
