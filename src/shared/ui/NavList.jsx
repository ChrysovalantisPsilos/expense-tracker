import { Link as RouterLink } from 'react-router-dom'
import { Box, Divider, HStack, Stack, Text } from '@chakra-ui/react'
import { ChevronRight } from 'lucide-react'
import IconTile from './kit/IconTile.jsx'
import Panel from './kit/Panel.jsx'
import SectionLabel from './kit/SectionLabel.jsx'

// An iOS-style grouped list: one lifted Panel, rows split by hairlines, with
// an optional SectionLabel `label` above it ("PREFERENCES"). Used by the More
// tab and the Settings page.
export function NavList({ label, children }) {
  const list = (
    <Panel p={0} overflow="hidden">
      <Stack spacing={0} divider={<Divider />}>{children}</Stack>
    </Panel>
  )
  if (!label) return list
  return (
    <Box>
      <SectionLabel mb={2} px={1}>{label}</SectionLabel>
      {list}
    </Box>
  )
}

// One row: a sand icon tile (or custom `media`, e.g. an avatar), a label, an
// optional muted description, and a chevron when it navigates. Pass `to` for
// an in-app link or `onClick` for an action (rendered as a button). Other
// props (e.g. a data- attribute) go on the row.
export function NavRow({ to, href, onClick, icon, media, label, description, ...rest }) {
  const target = to ? { as: RouterLink, to }
    : href ? { as: 'a', href }
    : { as: 'button', type: 'button', onClick }
  return (
    <HStack {...target} {...rest} textAlign="left" w="full" spacing={3} px={4} py={3.5} minW={0}
      _hover={{ bg: 'bg.subtle' }} _focusVisible={{ bg: 'bg.subtle', boxShadow: 'outline' }}
      transition="background 0.15s">
      {media ?? <IconTile icon={icon} size={40} radius="xl" />}
      <Box flex="1" minW={0}>
        <Text fontWeight="600" overflowWrap="anywhere">{label}</Text>
        {description && (
          <Text fontSize="sm" color="text.muted" overflowWrap="anywhere">{description}</Text>
        )}
      </Box>
      {to && <Box color="text.muted" flexShrink={0}><ChevronRight size={18} /></Box>}
    </HStack>
  )
}
