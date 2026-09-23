import { Box, HStack, Tag, Text } from '@chakra-ui/react'
import IconTile from './IconTile.jsx'
import RowActions from '../RowActions.jsx'
import { MotionBox } from './motion.jsx'
import { barWidth, fillColor, playProps } from './kitMath.js'

// A budget/goal row: icon tile, title, muted `meta` ("€312.40 of €400.00"),
// the percent on the right — or an "Over budget" pill once over — and a
// progress bar underneath.
//   percent  number; drives the bar (clamped to 100%) and the default label
//   tone     bar fill: undefined (brand) | 'warning' | 'negative' | 'positive'
//            — budgetTone()'s output fits. Defaults to 'negative' when over.
//   over     defaults to percent > 100; shows `overLabel` as a red pill
//   valueLabel overrides the "78%" text
//   icon / media, actions / actionSlots as in ItemRow
//   tooltip  native hover tooltip for the whole row (its HTML `title`; the
//            `title` prop is the row's heading)
//   playback / delay: optional usePlayback() gate to grow the bar in
export default function ProgressRow({
  icon, media, title, meta, percent, tone, over = percent > 100, overLabel = 'Over budget',
  valueLabel = `${percent}%`, actions, actionSlots, tooltip, playback, delay = 0, ...props
}) {
  const fill = fillColor(tone ?? (over ? 'negative' : 'brand'))
  const width = barWidth(percent)
  return (
    <Box title={tooltip} {...props}>
      <HStack spacing={3} mb={2}>
        {media ?? (icon && <IconTile icon={icon} />)}
        <Box flex="1" minW={0}>
          <Text fontSize="sm" fontWeight="600" noOfLines={1}>{title}</Text>
          {meta && <Text fontSize="xs" color="text.muted" noOfLines={1}>{meta}</Text>}
        </Box>
        {over ? (
          <Tag size="sm" colorScheme="red" borderRadius="full" flexShrink={0}>{overLabel}</Tag>
        ) : (
          <Text fontSize="sm" fontWeight="700" color="text.muted" flexShrink={0}>{valueLabel}</Text>
        )}
        {actions && <RowActions actions={actions} slots={actionSlots} />}
      </HStack>
      <Box h="8px" borderRadius="full" bg="bg.subtle" overflow="hidden">
        <MotionBox h="full" borderRadius="full" bg={fill}
          {...playProps(playback, { width: 0 }, { width }, { duration: 0.9, delay, ease: 'easeOut' })} />
      </Box>
    </Box>
  )
}
