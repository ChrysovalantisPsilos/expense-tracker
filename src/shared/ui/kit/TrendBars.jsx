import { Flex, HStack, Text } from '@chakra-ui/react'
import { MotionBox } from './motion.jsx'
import { playProps, trendHeights } from './kitMath.js'

// Rounded columns, one per period, scaled to the largest value: pale brand
// (warm grey in dark mode, 3.3:1 on the card), with the `current` column
// (default: the last) in full brand colour.
//   bars    [{ label: 'Sep', value: number }] — value in any unit (minor ok)
//   current index of the highlighted column
//   h       chart height; playback grows the columns in
//   onPick  makes each column a button: onPick(index) picks that period
//           (its `aria-label` from bars[i].ariaLabel, `current` pressed)
// Put the headline ("Sep: €1,635.00") in a SectionLabel's `aside` above it.
export default function TrendBars({ bars, current = bars.length - 1, h = '110px', playback, onPick, ...props }) {
  const heights = trendHeights(bars.map((b) => b.value))
  return (
    <HStack align="end" spacing={{ base: 2, md: 3 }} h={h} {...props}>
      {bars.map((b, i) => {
        const now = i === current
        return (
          <Flex key={b.label} direction="column" align="center" justify="end" flex="1" h="full" gap={1.5}
            {...(onPick ? {
              as: 'button', type: 'button', onClick: () => onPick(i), 'aria-pressed': now, 'aria-label': b.ariaLabel,
              borderRadius: 'md', _focusVisible: { boxShadow: 'outline' }, cursor: 'pointer',
            } : {})}>
            <MotionBox w="full" maxW="36px" borderTopRadius="md" borderBottomRadius="sm"
              bg={now ? 'brand.500' : 'brand.100'}
              _dark={{ bg: now ? 'brand.400' : 'sand.600' }}
              {...playProps(playback, { height: 0 }, { height: heights[i] },
                { duration: 0.7, delay: 0.08 * i, ease: 'easeOut' })} />
            <Text fontSize="xs" color="text.muted">{b.label}</Text>
          </Flex>
        )
      })}
    </HStack>
  )
}
