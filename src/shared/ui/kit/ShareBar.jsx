import { Link as RouterLink } from 'react-router-dom'
import { Box, Flex, HStack, SimpleGrid, Text } from '@chakra-ui/react'
import { ChevronRight } from 'lucide-react'
import { MotionBox } from './motion.jsx'
import { playProps, shareSwatch } from './kitMath.js'

// items for both: [{ label, share, name? }] — share is an integer percent and the
// shares should sum to 100 (categoryBars / distributeByWeights give that).
// Optional `color` per item; otherwise shareSwatch() picks one by position
// (the "Other" bucket is always muted: `name` is the bucket's internal
// name when `label` is translated). Give both components the same items.
// Optional `to` (in-app path) + `linkLabel` (its accessible name) make that
// legend entry a drill-down link; StackedBar ignores them.
const colorOf = (item, i) => item.color ?? shareSwatch(i, item.name ?? item.label)

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

// A linked legend entry: a 32px-tall tap target that bleeds 4px sideways so
// its hover fill has room, with a chevron after the percent.
const LINKED = {
  as: RouterLink, minH: '32px', px: 1, mx: -1, borderRadius: 'md',
  transition: 'background 0.15s', _hover: { bg: 'bg.subtle' },
  _focusVisible: { boxShadow: 'outline', outline: 'none' },
}

// The legend under a StackedBar: dot, muted name, bold percent, in columns.
// When some entries link, the others keep the chevron's room so the percents
// line up, and the 32px targets need no extra row gap.
export function ShareLegend({ items, columns = 2, ...props }) {
  const anyLinked = items.some((item) => item.to)
  return (
    <SimpleGrid columns={columns} spacingX={4} spacingY={anyLinked ? 0 : 1.5} {...props}>
      {items.map((item, i) => (
        <HStack key={item.label} spacing={2} minW={0}
          {...(item.to && { ...LINKED, to: item.to, 'aria-label': item.linkLabel })}>
          <Box boxSize="8px" borderRadius="full" bg={colorOf(item, i)} flexShrink={0} />
          <Text fontSize="xs" color="text.muted" flex="1" minW={0} overflowWrap="anywhere">{item.label}</Text>
          <Text fontSize="xs" fontWeight="700">{item.share}%</Text>
          {item.to
            ? <Box color="text.muted" flexShrink={0} aria-hidden><ChevronRight size={14} /></Box>
            : anyLinked && <Box w="14px" flexShrink={0} />}
        </HStack>
      ))}
    </SimpleGrid>
  )
}
