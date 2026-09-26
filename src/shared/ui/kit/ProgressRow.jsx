import { Link as RouterLink } from 'react-router-dom'
import { Box, HStack, LinkBox, LinkOverlay, Tag, Text } from '@chakra-ui/react'
import { ChevronRight } from 'lucide-react'
import IconTile from './IconTile.jsx'
import RowActions from '../RowActions.jsx'
import { MotionBox } from './motion.jsx'
import { barWidth, fillColor, playProps } from './kitMath.js'
import { landscapeOnly, ONE_LINE } from '../../lib/shortLandscape.js'
import { useT } from '../../lib/i18n/I18nProvider.jsx'

// Sideways, the title and `meta` share one line when both fit whole (a card
// of bars is then half as tall); when they don't, `meta` drops under the
// title as on a phone rather than cutting either.
const SHORT_TEXT = landscapeOnly({ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 2 })
const SHORT_TITLE = landscapeOnly({ ...ONE_LINE, flex: '1 0 auto', maxW: '100%' })
const SHORT_META = landscapeOnly({ whiteSpace: 'nowrap', flexShrink: 0 })
const SHORT_TAG = landscapeOnly({ mt: 0, flexShrink: 0 })

// A linked row is a LinkBox: its title is the link, stretched over the whole
// row, so the row is one tab stop and one tap target, while `actions` sit
// above the stretch and stay their own buttons (no nested interactives).
// (Chakra's LinkBox only lifts nested <a>s; the actions wrapper below is
// positioned for the same effect.)
// It bleeds 8px/6px so the hover fill has room while the content stays
// aligned with plain rows; the focus ring is drawn on the stretched area.
const LINKED = {
  borderRadius: 'lg', px: 2, mx: -2, py: 1.5, my: -1.5,
  transition: 'background 0.15s', _hover: { bg: 'bg.subtle' },
}
const OVERLAY_FOCUS = {
  _focusVisible: { outline: 'none' },
  sx: { '&:focus-visible::before': { boxShadow: 'outline', borderRadius: 'lg' } },
}

// A budget/goal row: icon tile, title, muted `meta` ("€312.40 of €400.00"),
// the percent on the right — or an "Over budget" pill once over — and a
// progress bar underneath.
//   percent  number; drives the bar (clamped to 100%) and the default label
//   tone     bar fill: undefined (brand) | 'warning' | 'negative' | 'positive'
//            — budgetTone()'s output fits. Defaults to 'negative' when over.
//   over     defaults to percent > 100; shows `overLabel` as a red pill
//            under the title, and the percentage turns red
//   valueLabel overrides the "78%" text
//   icon / media, actions / actionSlots as in ItemRow; `actionSize` 'lg'
//            gives the actions 44px targets (RowActions)
//   tooltip  native hover tooltip for the whole row (its HTML `title`; the
//            `title` prop is the row's heading)
//   playback / delay: optional usePlayback() gate to grow the bar in
//   to       in-app path: the row becomes a link (drill-down) with a chevron;
//            `linkLabel` is its accessible name ("Show Groceries expenses for
//            this month") — the visible title alone is too terse out of context
export default function ProgressRow({
  icon, media, title, meta, percent, tone, over = percent > 100, overLabel,
  valueLabel = `${percent}%`, actions, actionSlots, actionSize, tooltip, playback, delay = 0,
  to, linkLabel, ...props
}) {
  const t = useT('common')
  const fill = fillColor(tone ?? (over ? 'negative' : 'brand'))
  const width = barWidth(percent)
  const Root = to ? LinkBox : Box
  return (
    <Root title={tooltip} {...(to && LINKED)} {...props}>
      <HStack spacing={3} mb={2}>
        {media ?? (icon && <IconTile icon={icon} />)}
        <Box flex="1" minW={0} sx={SHORT_TEXT}>
          <Text fontSize="sm" fontWeight="600" overflowWrap="anywhere" sx={SHORT_TITLE}>
            {to ? (
              <LinkOverlay as={RouterLink} to={to} aria-label={linkLabel} {...OVERLAY_FOCUS}>
                {title}
              </LinkOverlay>
            ) : title}
          </Text>
          {meta && <Text fontSize="xs" color="text.muted" overflowWrap="anywhere" sx={SHORT_META}>{meta}</Text>}
          {/* Under the title, so the name keeps the row's width on a phone. */}
          {over && <Tag size="sm" colorScheme="red" borderRadius="full" mt={1} sx={SHORT_TAG}>{overLabel ?? t('budget.over')}</Tag>}
        </Box>
        <Text fontSize="sm" fontWeight="700" color={over ? 'status.negative' : 'text.muted'} flexShrink={0}>
          {valueLabel}
        </Text>
        {to && <Box color="text.muted" flexShrink={0} aria-hidden><ChevronRight size={16} /></Box>}
        {actions && (to ? (
          // Positioned after the link's stretch, so it paints (and clicks) above it.
          <Box position="relative" flexShrink={0}>
            <RowActions actions={actions} slots={actionSlots} size={actionSize} />
          </Box>
        ) : <RowActions actions={actions} slots={actionSlots} size={actionSize} />)}
      </HStack>
      <Box h="8px" borderRadius="full" bg="bg.subtle" overflow="hidden">
        <MotionBox h="full" borderRadius="full" bg={fill}
          {...playProps(playback, { width: 0 }, { width }, { duration: 0.9, delay, ease: 'easeOut' })} />
      </Box>
    </Root>
  )
}
