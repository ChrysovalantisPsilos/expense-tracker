import { Box, HStack, Stack, Text } from '@chakra-ui/react'
import IconTile from './IconTile.jsx'
import RowActions from '../RowActions.jsx'
import RowAmount from '../RowAmount.jsx'
import { textColor } from './kitMath.js'

// A list row: icon tile · title over a muted meta line · bold amount on the
// right (optionally a muted line under it) · optional row actions. Covers
// expense, transaction, recurring and payment rows.
//   icon    Lucide component → 32px sand IconTile; or pass `media` (any node:
//           CategoryBadge, UserAvatar…) instead
//   meta    string or node under the title ("Paid by Anna", date · category)
//   amount  formatted string; `amountTone` colours it; `amountMeta` sits under
//   actions RowActions items ([{ label, icon, onClick, danger? }]); when given,
//           the amount column gets a fixed width so a list's figures line up.
//           `actionSlots` reserves room for that many buttons on every row.
//   onClick makes the whole row a button
export default function ItemRow({
  icon, media, title, meta, amount, amountTone = 'default', amountMeta,
  actions, actionSlots, onClick, ...props
}) {
  const fixed = actions !== undefined
  const AmountText = fixed ? RowAmount : Text
  const click = onClick ? {
    as: 'button', type: 'button', onClick, textAlign: 'left', w: 'full',
    _hover: { bg: 'bg.subtle' }, _focusVisible: { boxShadow: 'outline' }, borderRadius: 'lg',
  } : {}
  return (
    <HStack spacing={3} py={2} minW={0} {...click} {...props}>
      {media ?? (icon && <IconTile icon={icon} />)}
      <Box flex="1" minW={0}>
        <Text fontSize="sm" fontWeight="600" noOfLines={1}>{title}</Text>
        {meta && (typeof meta === 'string'
          ? <Text fontSize="xs" color="text.muted" noOfLines={1}>{meta}</Text>
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
      {fixed && <RowActions actions={actions} slots={actionSlots} />}
    </HStack>
  )
}
