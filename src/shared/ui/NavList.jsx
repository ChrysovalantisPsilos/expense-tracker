import { Link as RouterLink } from 'react-router-dom'
import { Box, Card, Divider, HStack, Stack, Text } from '@chakra-ui/react'
import { ChevronRight } from 'lucide-react'
import IconTile from './kit/IconTile.jsx'

// An iOS-style grouped list: one card, rows split by hairlines. Used by the
// More tab and the Settings page.
export function NavList({ children }) {
  return (
    <Card overflow="hidden">
      <Stack spacing={0} divider={<Divider />}>{children}</Stack>
    </Card>
  )
}

// One row: a sand icon tile (or custom `media`, e.g. an avatar), a label, an
// optional muted description, and a chevron when it navigates. Pass `to` for
// an in-app link or `onClick` for an action (rendered as a button).
export function NavRow({ to, onClick, icon, media, label, description }) {
  const target = to ? { as: RouterLink, to } : { as: 'button', type: 'button', onClick }
  return (
    <HStack {...target} textAlign="left" w="full" spacing={3} px={4} py={3.5} minW={0}
      _hover={{ bg: 'bg.subtle' }} _focusVisible={{ bg: 'bg.subtle', boxShadow: 'outline' }}
      transition="background 0.15s">
      {media ?? <IconTile icon={icon} size={40} radius="xl" />}
      <Box flex="1" minW={0}>
        <Text fontWeight="600" noOfLines={1}>{label}</Text>
        {description && (
          <Text fontSize="sm" color="text.muted" whiteSpace="nowrap" overflow="hidden"
            textOverflow="ellipsis">{description}</Text>
        )}
      </Box>
      {to && <Box color="text.muted" flexShrink={0}><ChevronRight size={18} /></Box>}
    </HStack>
  )
}
