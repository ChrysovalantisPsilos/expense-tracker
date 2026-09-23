import { HStack, Text } from '@chakra-ui/react'
import Eyebrow from '../Eyebrow.jsx'

// A muted uppercase label that opens a block inside a Panel ("BALANCES",
// "LAST 6 MONTHS"), with an optional bold `aside` on the right (e.g.
// "Sep: €1,635.00"). Style props (mb…) pass to the row.
export default function SectionLabel({ children, aside, ...props }) {
  return (
    <HStack justify="space-between" align="baseline" spacing={3} {...props}>
      <Eyebrow color="text.muted" letterSpacing="0.06em" lineHeight="1.5">{children}</Eyebrow>
      {aside && <Text fontSize="sm" fontWeight="700" flexShrink={0}>{aside}</Text>}
    </HStack>
  )
}
