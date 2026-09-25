import { Box, HStack, IconButton, Menu, MenuButton, MenuItem, MenuList } from '@chakra-ui/react'
import { MoreVertical } from 'lucide-react'

const GAP_PX = 4
// 'xs': compact 24px buttons for dense lists; 'lg': 44×44 touch targets, for
// rows whose actions are a main way in (the Budgets page's edit/delete).
const SIZES = {
  xs: { button: { size: 'xs' }, px: 24, icon: 14, menuIcon: 16 },
  lg: { button: { boxSize: '44px', minW: '44px' }, px: 44, icon: 18, menuIcon: 20 },
}

// A container's style that folds its rows' actions into the ⋯ menu whatever
// the screen width — for rows in a column too narrow for inline buttons (a
// Home stack on a small phone held sideways): sx={{ [query]: FOLD_ROW_ACTIONS }}.
export const FOLD_ROW_ACTIONS = {
  '& .row-actions-inline': { display: 'none' },
  '& .row-actions-menu': { display: 'block' },
}

// A list row's trailing actions. From `sm` up each action is an inline icon
// button; on phones they fold into one ⋯ menu so the row's title keeps its
// width. The slot is always `slots` buttons wide (one on phones), even when a
// row has no actions, so amounts in neighbouring rows line up.
// actions: [{ label, icon: LucideIcon, onClick, danger?, menuOnly? }] —
// `menuOnly` actions appear only in the phone menu (e.g. when the row already
// has its own desktop control for them). `size`: 'xs' (default) | 'lg'.
export default function RowActions({ actions, slots = actions.length, size = 'xs' }) {
  const s = SIZES[size]
  const inline = actions.filter((a) => !a.menuOnly)
  return (
    <>
      <HStack className="row-actions-inline" spacing={`${GAP_PX}px`} justify="end" flexShrink={0}
        display={{ base: 'none', sm: 'flex' }}
        w={`${slots * s.px + Math.max(0, slots - 1) * GAP_PX}px`}>
        {inline.map(({ label, icon: Icon, onClick, danger }) => (
          <IconButton key={label} aria-label={label} {...s.button} variant="ghost"
            color={danger ? 'status.negative' : undefined} icon={<Icon size={s.icon} />}
            onClick={onClick} />
        ))}
      </HStack>
      <Box className="row-actions-menu" display={{ base: 'block', sm: 'none' }} w={`${s.px}px`} flexShrink={0}>
        {actions.length > 0 && (
          // `fixed`: the unopened list sits at its anchor's corner, and inside
          // a positioned row (a linked ProgressRow) an absolute one would
          // widen the page past the screen edge.
          <Menu placement="bottom-end" isLazy strategy="fixed">
            <MenuButton as={IconButton} aria-label="More actions" {...s.button} variant="ghost"
              color="text.muted" icon={<MoreVertical size={s.menuIcon} />} />
            <MenuList minW="170px">
              {actions.map(({ label, icon: Icon, onClick, danger }) => (
                <MenuItem key={label} icon={<Icon size={16} />} onClick={onClick} minH="44px"
                  color={danger ? 'status.negative' : undefined}>
                  {label}
                </MenuItem>
              ))}
            </MenuList>
          </Menu>
        )}
      </Box>
    </>
  )
}
