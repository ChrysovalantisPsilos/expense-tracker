import { Box, Flex, HStack, SimpleGrid, Stack, Text } from '@chakra-ui/react'
import { formatMoney } from '../../shared/lib/currency.js'
import { DEMO_CURRENCY, insightsDemo } from './landingDemo.js'
import MockCard from './MockCard.jsx'
import { MotionBox, usePlayback } from './motion.jsx'

const { byCategory, trend } = insightsDemo()
const PEAK = Math.max(...trend.map((t) => t.minor))
const LATEST = trend[trend.length - 1]
// Swatch per category slice, in demo order (last one is "Other").
const SWATCHES = ['brand.500', 'amber.400', 'brand.300', 'amber.600', 'text.muted']

// Spending by category (one stacked bar + legend) and a 6-month trend whose
// columns grow in when scrolled into view.
export default function InsightsMock() {
  const { ref, reduce, inView } = usePlayback({ once: true })
  const shown = reduce || inView
  const grow = (i) => ({ duration: 0.7, delay: 0.08 * i, ease: 'easeOut' })

  return (
    <MockCard title="Where your money went" playbackRef={ref}
      label="Example insights: spending split by category and a six-month spending trend.">
      <Stack spacing={5}>
        <Box>
          <Flex h="12px" borderRadius="full" overflow="hidden" bg="bg.subtle" gap="2px">
            {byCategory.map((c, i) => (
              <MotionBox key={c.category} h="full" bg={SWATCHES[i]}
                initial={reduce ? false : { width: 0 }}
                animate={{ width: shown ? `${c.share}%` : 0 }}
                transition={grow(i)} />
            ))}
          </Flex>
          <SimpleGrid columns={2} spacingX={4} spacingY={1.5} mt={3}>
            {byCategory.map((c, i) => (
              <HStack key={c.category} spacing={2} minW={0}>
                <Box boxSize="8px" borderRadius="full" bg={SWATCHES[i]} flexShrink={0} />
                <Text fontSize="xs" color="text.muted" noOfLines={1} flex="1">{c.category}</Text>
                <Text fontSize="xs" fontWeight="700">{c.share}%</Text>
              </HStack>
            ))}
          </SimpleGrid>
        </Box>

        <Box>
          <HStack justify="space-between" align="baseline" mb={3}>
            <Text fontSize="xs" fontWeight="700" color="text.muted" textTransform="uppercase" letterSpacing="0.06em">
              Last 6 months
            </Text>
            <Text fontSize="sm" fontWeight="700">{LATEST.month}: {formatMoney(LATEST.minor, DEMO_CURRENCY)}</Text>
          </HStack>
          <HStack align="end" spacing={{ base: 2, md: 3 }} h="110px">
            {trend.map((t, i) => (
              <Flex key={t.month} direction="column" align="center" justify="end" flex="1" h="full" gap={1.5}>
                <MotionBox w="full" maxW="36px" borderTopRadius="md" borderBottomRadius="sm"
                  bg={t === LATEST ? 'brand.500' : 'brand.100'}
                  _dark={{ bg: t === LATEST ? 'brand.400' : 'whiteAlpha.200' }}
                  initial={reduce ? false : { height: 0 }}
                  animate={{ height: shown ? `${(t.minor / PEAK) * 85}%` : 0 }}
                  transition={grow(i)} />
                <Text fontSize="xs" color="text.muted">{t.month}</Text>
              </Flex>
            ))}
          </HStack>
        </Box>
      </Stack>
    </MockCard>
  )
}
