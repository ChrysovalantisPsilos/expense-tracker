import { SimpleGrid, Text } from '@chakra-ui/react'
import Tile from './Tile.jsx'
import Figure from './Figure.jsx'
import { textColor } from './kitMath.js'

// A 2-column grid of BalanceTiles (per-member balances, account totals).
export function BalanceGrid({ children, columns = 2, ...props }) {
  return <SimpleGrid columns={columns} spacing={2} {...props}>{children}</SimpleGrid>
}

// One sand tile: muted `label` over a bold `value`, optionally a small muted
// `note` under it ("incl. €40.00 upcoming"). `size="md"` shows the value as a
// Poppins Figure (a headline tile, e.g. Home's Income / Net). For a signed
// balance use signedAmount() from kitMath for the "+€…"/"−€…" text and `tone`.
export function BalanceTile({ label, value, tone = 'default', note, size = 'sm', ...props }) {
  const md = size === 'md'
  return (
    <Tile py={md ? 2.5 : 2} minW={0} {...props}>
      {md ? <Figure label={label} value={value} tone={tone} /> : (
        <>
          <Text fontSize="xs" color="text.muted" noOfLines={1}>{label}</Text>
          <Text fontSize="sm" fontWeight="700" color={textColor(tone)} whiteSpace="nowrap">{value}</Text>
        </>
      )}
      {note && <Text fontSize="xs" color="text.muted" noOfLines={1}>{note}</Text>}
    </Tile>
  )
}
