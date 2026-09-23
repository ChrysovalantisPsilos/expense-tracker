import { Box, HStack, Stack, Text } from '@chakra-ui/react'
import { ChevronRight } from 'lucide-react'
import IconTile from './IconTile.jsx'
import RowActions from '../RowActions.jsx'
import RowAmount from '../RowAmount.jsx'
import { textColor } from './kitMath.js'

const CLICKABLE = {
  as: 'button', type: 'button', textAlign: 'left',
  _hover: { bg: 'bg.subtle' }, _focusVisible: { boxShadow: 'outline' }, borderRadius: 'lg',
}

// A list row: icon tile · title over a muted meta line · bold amount on the
// right (optionally a muted line under it) · optional trailing control · row
// actions. Covers expense, transaction, recurring and payment rows.
//   icon    Lucide component → 32px sand IconTile; or pass `media` (any node:
//           CategoryBadge, UserAvatar…) instead
//   meta    string or node under the title ("Paid by Anna", date · category)
//   amount  formatted string; `amountTone` colours it; `amountMeta` sits under
//   trailing node between the amount and the actions (a Switch, a comment
//           button); give it a fixed width so a list's amounts line up
//   actions RowActions items ([{ label, icon, onClick, danger? }]); when given,
//           the amount column gets a fixed width so a list's figures line up.
//           `actionSlots` reserves room for that many buttons on every row.
//   dimmed  fades the row's content (e.g. a paused rule) but not its controls
//   onClick makes the row a button — icon, text and amount only: `trailing`
//           and `actions` stay outside it, so buttons never nest.
//           `chevron` ends the button with a › (it opens a page)
export default function ItemRow({
  icon, media, title, meta, amount, amountTone = 'default', amountMeta,
  trailing, actions, actionSlots, dimmed, onClick, chevron, py = 2, ...props
}) {
  const fixed = actions !== undefined
  const AmountText = fixed ? RowAmount : Text
  const controls = (trailing != null || fixed) && (
    <>
      {trailing}
      {fixed && <RowActions actions={actions} slots={actionSlots} />}
    </>
  )
  const content = (
    <>
      {media ?? (icon && <IconTile icon={icon} />)}
      <Box flex="1" minW={0}>
        <Text fontSize="sm" fontWeight="600" overflowWrap="anywhere">{title}</Text>
        {meta && (typeof meta === 'string'
          ? <Text fontSize="xs" color="text.muted" overflowWrap="anywhere">{meta}</Text>
          : meta)}
      </Box>
      {amount !== undefined && (
        <Stack spacing={0} align="flex-end" flexShrink={0}>
          <AmountText fontSize="sm" fontWeight="700" color={textColor(amountTone)} whiteSpace="nowrap">
            {amount}
          </AmountText>
          {amountMeta && <Text fontSize="xs" color="text.muted" whiteSpace="nowrap">{amountMeta}</Text>}
        </Stack>
      )}
      {onClick && chevron && (
        <Box color="text.muted" flexShrink={0} aria-hidden><ChevronRight size={16} /></Box>
      )}
    </>
  )
  const body = dimmed
    ? <HStack spacing={3} flex="1" minW={0} opacity={0.55}>{content}</HStack>
    : content

  // Clickable with controls: the button is its own box (it takes `py`),
  // bleeding 4px each side so its hover fill has room while its content stays
  // aligned with non-clickable rows.
  if (onClick && controls) {
    return (
      <HStack spacing={3} minW={0} {...props}>
        <HStack spacing={3} flex="1" minW={0} py={py} px={1} mx={-1} {...CLICKABLE} onClick={onClick}>
          {body}
        </HStack>
        {controls}
      </HStack>
    )
  }
  const click = onClick ? { ...CLICKABLE, onClick, w: 'full' } : {}
  return (
    <HStack spacing={3} py={py} minW={0} {...click} {...props}>
      {body}
      {controls}
    </HStack>
  )
}
