import { Box, Flex, HStack, Text } from '@chakra-ui/react'
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
        {/* The two people wrap onto separate lines when their names are long. */}
        <Flex flex="1" minW={0} wrap="wrap" align="center" columnGap={2} rowGap={1}>
          <Person {...from} />
          <Box color="text.muted" flexShrink={0}><ArrowRight size={14} /></Box>
          <Person {...to} />
        </Flex>
        <Text fontSize="sm" fontWeight="800" color={textColor(amountTone)} whiteSpace="nowrap">{amount}</Text>
        {action}
      </HStack>
    </Tile>
  )
}

function Person({ name, src, highlight }) {
  return (
    <HStack spacing={2} minW={0} maxW="100%">
      <UserAvatar name={name} src={src} highlight={highlight} size="xs" />
      <Text fontSize="sm" fontWeight="600" minW={0} overflowWrap="anywhere">{name}</Text>
    </HStack>
  )
}
