import { Box, Heading, HStack, Text } from '@chakra-ui/react'
import Eyebrow from './Eyebrow.jsx'
import IconTile from './kit/IconTile.jsx'

// Heading row for a card: a sand icon tile, a Poppins title (h2) with an
// optional coral eyebrow above it, an optional muted subtitle, and an
// optional small action on the right. `icon` is a Lucide component;
// `iconTone` recolours its tile (IconTile's `tone`: 'negative' = pale red
// danger tile). The tile and title are a step larger than a list row's
// (32px badge, 14px title) so a header never reads as one more row;
// `divider` also rules it off from a list of rows below it (the expense
// lists). Extra props (e.g. mb) pass through to the row.
export default function CardHeader({ icon, iconTone, title, eyebrow, subtitle, action, divider, ...props }) {
  const rule = divider ? { pb: 3, borderBottomWidth: '1px', borderColor: 'border.default', mb: 2 } : {}
  return (
    <HStack spacing={3} mb={4} {...rule} {...props}>
      {icon && <IconTile icon={icon} tone={iconTone} size={36} />}
      <Box flex="1" minW={0}>
        {eyebrow && <Eyebrow overflowWrap="anywhere" mb={0.5}>{eyebrow}</Eyebrow>}
        {title && <Heading as="h2" size="sm" fontSize="lg" lineHeight="1.4" overflowWrap="anywhere">{title}</Heading>}
        {subtitle && <Text fontSize="xs" color="text.muted" overflowWrap="anywhere">{subtitle}</Text>}
      </Box>
      {action && <HStack spacing={1} flexShrink={0}>{action}</HStack>}
    </HStack>
  )
}
