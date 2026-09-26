import { Box, HStack, Text } from '@chakra-ui/react'
import { ArrowRight } from 'lucide-react'
import Tile from './Tile.jsx'
import { Reveal } from './motion.jsx'
import { rateText } from '../../lib/currency.js'

// A sand tile for a foreign-currency amount: `label` with "@ rate" muted on
// the right, then "£42.50 → €49.73" with the converted amount in accent.
//   from / to  formatted amounts (original / converted)
//   rate       display string, or a number shown in the app's language
//              ("@ 1.17", Greek "@ 1,17"); omit to hide
//   playback / delay: optional gate that reveals the converted amount
export default function ConversionRow({ label, rate, from, to, playback, delay, ...props }) {
  return (
    <Tile {...props}>
      <HStack justify="space-between" spacing={2}>
        <Text fontSize="sm" fontWeight="600" overflowWrap="anywhere">{label}</Text>
        {rate !== undefined && <Text fontSize="xs" color="text.muted" flexShrink={0}>@ {typeof rate === 'number' ? rateText(rate) : rate}</Text>}
      </HStack>
      <HStack spacing={2} mt={1}>
        <Text fontSize="sm" color="text.muted">{from}</Text>
        <Box color="text.muted"><ArrowRight size={14} /></Box>
        <Reveal playback={playback} delay={delay}>
          <Text fontSize="sm" fontWeight="800" color="accent.fg">{to}</Text>
        </Reveal>
      </HStack>
    </Tile>
  )
}
