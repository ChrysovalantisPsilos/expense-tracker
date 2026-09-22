import { Box, HStack, IconButton, Menu, MenuButton, MenuItem, MenuList } from '@chakra-ui/react'
import { MoreVertical } from 'lucide-react'

const ICON_PX = 24 // Chakra's xs IconButton
const GAP_PX = 4

// A list row's trailing actions. From `sm` up each action is a small inline
// icon button; on phones they fold into one ⋯ menu so the row's title keeps
// its width. The slot is always `slots` buttons wide (one on phones), even
// when a row has no actions, so amounts in neighbouring rows line up.
// actions: [{ label, icon: LucideIcon, onClick, danger?, menuOnly? }] —
// `menuOnly` actions appear only in the phone menu (e.g. when the row already
// has its own desktop control for them).
export default function RowActions({ actions, slots = actions.length }) {
  const inline = actions.filter((a) => !a.menuOnly)
  return (
    <>
      <HStack spacing={`${GAP_PX}px`} justify="end" flexShrink={0}
        display={{ base: 'none', sm: 'flex' }}
        w={`${slots * ICON_PX + Math.max(0, slots - 1) * GAP_PX}px`}>
        {inline.map(({ label, icon: Icon, onClick, danger }) => (
          <IconButton key={label} aria-label={label} size="xs" variant="ghost"
            color={danger ? 'status.negative' : undefined} icon={<Icon size={14} />}
            onClick={onClick} />
        ))}
      </HStack>
      <Box display={{ base: 'block', sm: 'none' }} w={`${ICON_PX}px`} flexShrink={0}>
        {actions.length > 0 && (
          <Menu placement="bottom-end" isLazy>
            <MenuButton as={IconButton} aria-label="More actions" size="xs" variant="ghost"
              color="text.muted" icon={<MoreVertical size={16} />} />
            <MenuList minW="170px">
              {actions.map(({ label, icon: Icon, onClick, danger }) => (
                <MenuItem key={label} icon={<Icon size={16} />} onClick={onClick}
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
