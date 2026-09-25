import { forwardRef } from 'react'
import { Box, Button, Flex, Heading, HStack, Text } from '@chakra-ui/react'
import Eyebrow from './Eyebrow.jsx'
import { ShellSlot, useShellHeader } from './ShellHeader.jsx'
import { ONE_LINE, SHORT_LANDSCAPE } from '../lib/shortLandscape.js'

// On a phone held sideways outside the app shell (Help, the legal pages
// signed out) the title steps down two sizes, so it doesn't take a fifth of
// the screen's height.
const SHORT_TITLE = { [SHORT_LANDSCAPE]: { fontSize: 'xl' } }

// The page's title row: optional coral eyebrow, the page's single <h1>, an
// optional muted description, and an `action` slot on the right. `leading`
// holds anything that sits before the title (a back button, a group photo);
// `meta` is an optional node under the title (e.g. a group's member stack).
// The title wraps (breaking long unbroken names too) so it is always readable
// while the action keeps its place on the right.
// Inside the app shell on a phone held sideways, the row moves up into the
// shell's slim header (ShellHeader.jsx) on one line — a smaller eyebrow over
// a title cut with an ellipsis — while the description and `meta` stay at
// the top of the page.
export default function PageHeader({ title, eyebrow, description, action, leading, meta }) {
  const shell = useShellHeader()
  if (shell) {
    return (
      <>
        <ShellSlot slot="title">
          <Flex align="center" gap={2} flex="1" minW={0}>
            {leading}
            <Box flex="0 1 auto" minW={0}>
              {eyebrow && <Eyebrow fontSize="10px" lineHeight="1.3" sx={ONE_LINE}>{eyebrow}</Eyebrow>}
              <Heading as="h1" fontSize="xl" letterSpacing="-0.02em" lineHeight="1.25" sx={ONE_LINE}>
                {title}
              </Heading>
            </Box>
            {/* The controls take the rest, right-aligned; one that can grow
                (a search field) fills it. */}
            {action && <HStack spacing={2} flex="1" minW={0} justify="flex-end">{action}</HStack>}
          </Flex>
        </ShellSlot>
        {(description || meta) && (
          <Box>
            {description && <Text color="text.muted" fontSize="sm">{description}</Text>}
            {meta && <Box mt={description ? 1.5 : 0}>{meta}</Box>}
          </Box>
        )}
      </>
    )
  }
  return (
    <Flex align="center" gap={3} minW={0}>
      {leading}
      <Box flex="1" minW={0}>
        {eyebrow && <Eyebrow overflowWrap="anywhere" mb={0.5}>{eyebrow}</Eyebrow>}
        <Heading as="h1" fontSize={{ base: '2xl', md: '3xl' }} letterSpacing="-0.02em"
          lineHeight="1.2" overflowWrap="anywhere" sx={SHORT_TITLE}>
          {title}
        </Heading>
        {description && <Text color="text.muted" fontSize="sm" mt={1}>{description}</Text>}
        {meta && <Box mt={1.5}>{meta}</Box>}
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
