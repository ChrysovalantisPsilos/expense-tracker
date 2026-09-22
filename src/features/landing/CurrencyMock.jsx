import { Box, Divider, HStack, Stack, Text } from '@chakra-ui/react'
import { ArrowRight } from 'lucide-react'
import { formatMoney } from '../../shared/lib/currency.js'
import { currencyDemo } from './landingDemo.js'
import MockCard from './MockCard.jsx'
import { MotionBox, usePlayback } from './motion.jsx'

const FX = currencyDemo()

// Foreign-currency expenses that convert to the base currency at the rate
// captured when they were logged; conversions reveal row by row in view.
export default function CurrencyMock() {
  const { ref, reduce, inView } = usePlayback({ once: true })
  const shown = reduce || inView
  const reveal = (i) => ({
    initial: reduce ? false : { opacity: 0, x: -8 },
    animate: shown ? { opacity: 1, x: 0 } : { opacity: 0, x: -8 },
    transition: { duration: 0.45, delay: 0.3 + 0.45 * i, ease: 'easeOut' },
  })

  return (
    <MockCard title={`Travel spending in ${FX.base}`} playbackRef={ref}
      label={`Example: expenses in pounds, dollars and yen converted to ${FX.base} at the rate captured when each was added.`}>
      <Stack spacing={3}>
        {FX.rows.map((r, i) => (
          <Box key={r.label} bg="bg.subtle" borderRadius="lg" px={3} py={2.5}>
            <HStack justify="space-between" spacing={2}>
              <Text fontSize="sm" fontWeight="600" noOfLines={1}>{r.label}</Text>
              <Text fontSize="xs" color="text.muted" flexShrink={0}>@ {r.rate}</Text>
            </HStack>
            <HStack spacing={2} mt={1}>
              <Text fontSize="sm" color="text.muted">{formatMoney(r.minor, r.currency)}</Text>
              <Box color="text.muted"><ArrowRight size={14} /></Box>
              <MotionBox {...reveal(i)}>
                <Text fontSize="sm" fontWeight="800" color="accent.fg">{formatMoney(r.baseMinor, FX.base)}</Text>
              </MotionBox>
            </HStack>
          </Box>
        ))}
        <Divider borderColor="border.default" />
        <HStack justify="space-between">
          <Text fontSize="sm" color="text.muted">Total</Text>
          <MotionBox {...reveal(FX.rows.length)}>
            <Text fontFamily="heading" fontWeight="700">{formatMoney(FX.totalBaseMinor, FX.base)}</Text>
          </MotionBox>
        </HStack>
      </Stack>
    </MockCard>
  )
}
