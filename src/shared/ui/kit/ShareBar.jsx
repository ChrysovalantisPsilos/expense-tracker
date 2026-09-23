import { Box, Flex, HStack, SimpleGrid, Text } from '@chakra-ui/react'
import { MotionBox } from './motion.jsx'
import { playProps, shareSwatch } from './kitMath.js'

// items for both: [{ label, share }] — share is an integer percent and the
// shares should sum to 100 (categoryBars / distributeByWeights give that).
// Optional `color` per item; otherwise shareSwatch() picks one by position
// ("Other" is always muted). Give both components the same items.
const colorOf = (item, i) => item.color ?? shareSwatch(i, item.label)

// One horizontal bar split into segments with a 2px gap. Optional
// `playback` grows the segments in.
export function StackedBar({ items, h = '12px', playback, ...props }) {
  return (
    <Flex h={h} borderRadius="full" overflow="hidden" bg="bg.subtle" gap="2px" {...props}>
      {items.map((item, i) => (
        <MotionBox key={item.label} h="full" bg={colorOf(item, i)}
          {...playProps(playback, { width: 0 }, { width: `${item.share}%` },
            { duration: 0.7, delay: 0.08 * i, ease: 'easeOut' })} />
      ))}
    </Flex>
  )
}

// The legend under a StackedBar: dot, muted name, bold percent, in columns.
export function ShareLegend({ items, columns = 2, ...props }) {
  return (
    <SimpleGrid columns={columns} spacingX={4} spacingY={1.5} {...props}>
      {items.map((item, i) => (
        <HStack key={item.label} spacing={2} minW={0}>
          <Box boxSize="8px" borderRadius="full" bg={colorOf(item, i)} flexShrink={0} />
          <Text fontSize="xs" color="text.muted" noOfLines={1} flex="1">{item.label}</Text>
          <Text fontSize="xs" fontWeight="700">{item.share}%</Text>
        </HStack>
      ))}
    </SimpleGrid>
  )
}
