import { Box, HStack, Text } from '@chakra-ui/react'
import { ArrowRight } from 'lucide-react'
import Tile from './Tile.jsx'
import UserAvatar from '../UserAvatar.jsx'
import { textColor } from './kitMath.js'

// A settle-up payment on a sand tile: avatar + name → avatar + name, amount
// in accent on the right.
//   from / to  { name, src?, highlight? } — highlight = the current user
//   amount     formatted string; `amountTone` (default 'accent')
//   action     optional node after the amount (e.g. a "Mark paid" button)
export default function TransferRow({ from, to, amount, amountTone = 'accent', action, ...props }) {
  return (
    <Tile {...props}>
      <HStack spacing={2} minW={0}>
        <UserAvatar name={from.name} src={from.src} highlight={from.highlight} size="xs" />
        <Text fontSize="sm" fontWeight="600" noOfLines={1}>{from.name}</Text>
        <Box color="text.muted" flexShrink={0}><ArrowRight size={14} /></Box>
        <UserAvatar name={to.name} src={to.src} highlight={to.highlight} size="xs" />
        <Text fontSize="sm" fontWeight="600" noOfLines={1} flex="1">{to.name}</Text>
        <Text fontSize="sm" fontWeight="800" color={textColor(amountTone)} whiteSpace="nowrap">{amount}</Text>
        {action}
      </HStack>
    </Tile>
  )
}
