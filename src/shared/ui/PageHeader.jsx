import { forwardRef } from 'react'
import { Box, Button, Flex, Heading, HStack, Text } from '@chakra-ui/react'
import Eyebrow from './Eyebrow.jsx'

// The page's title row: optional coral eyebrow, the page's single <h1>, an
// optional muted description, and an `action` slot on the right. `leading`
// holds anything that sits before the title (a back button, a group photo).
// The title truncates to one line so the action always stays on screen.
export default function PageHeader({ title, eyebrow, description, action, leading }) {
  return (
    <Flex align="center" gap={3} minW={0}>
      {leading}
      <Box flex="1" minW={0}>
        {eyebrow && <Eyebrow noOfLines={1} mb={0.5}>{eyebrow}</Eyebrow>}
        <Heading as="h1" fontSize={{ base: '2xl', md: '3xl' }} letterSpacing="-0.02em"
          lineHeight="1.2" noOfLines={1} wordBreak="break-all">
          {title}
        </Heading>
        {description && <Text color="text.muted" fontSize="sm" mt={1}>{description}</Text>}
      </Box>
      {action && <HStack spacing={2} flexShrink={0}>{action}</HStack>}
    </Flex>
  )
}

// A header action button that shows its icon + label from `sm` up and just
// the icon on phones, so PageHeader's action slot never crowds the title.
// Forwards its ref so it can sit inside a Tooltip or MenuButton.
export const PageAction = forwardRef(function PageAction({ icon, label, ...props }, ref) {
  return (
    <Button ref={ref} size="sm" aria-label={label} px={{ base: 2, sm: 3 }} {...props}>
      {icon}
      <Box as="span" display={{ base: 'none', sm: 'inline' }} ml={icon ? 2 : 0}>{label}</Box>
    </Button>
  )
})
