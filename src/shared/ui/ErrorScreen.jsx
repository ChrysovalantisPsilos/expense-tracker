import { Link as RouterLink } from 'react-router-dom'
import { Box, Button, Flex, Heading, Stack, Text } from '@chakra-ui/react'
import BrandGlow from './BrandGlow.jsx'
import Eyebrow from './Eyebrow.jsx'
import Logo from './Logo.jsx'
import LooseRing from './LooseRing.jsx'
import { errorScreen } from './errorScreens.js'

// Handlers every screen can fall back on. Plain page loads, so they also work
// where there's no router (the top-level error boundary sits above it).
const DEFAULT_HANDLERS = {
  reload: { onClick: () => window.location.reload() },
  home: { href: '/' },
}

// A handler is { to } (router link), { href } (full page load) or { onClick }.
function ActionButton({ label, primary, handler }) {
  const how = handler.to ? { as: RouterLink, to: handler.to }
    : handler.href ? { as: 'a', href: handler.href }
      : { onClick: handler.onClick }
  return (
    <Button {...how} size="lg" fontSize="md" px={6}
      variant={primary ? 'solid' : 'outline'} colorScheme={primary ? 'brand' : 'gray'}
      flex={{ base: '1 1 9rem', sm: '0 0 auto' }} minW={{ sm: '10rem' }}>
      {label}
    </Button>
  )
}

// The error screens (404, crash, new version, offline): the loose-ring
// illustration, eyebrow, heading, body and actions from errorScreens.js.
// `handlers` maps action ids to { to | href | onClick } (reload and home have
// defaults). `detail` is the technical message, shown on the crash screen.
// `fullPage` fills the viewport with a header (`header`, else a plain logo
// bar); otherwise it sits inside the app shell's content column.
export default function ErrorScreen({
  variant, signedIn = false, detail, handlers, fullPage = false, header, headingAs = 'h1',
}) {
  const screen = errorScreen(variant, { signedIn })
  const all = { ...DEFAULT_HANDLERS, ...handlers }

  const content = (
    <Stack spacing={{ base: 5, md: 6 }} align="center" textAlign="center" w="full" maxW="30rem" position="relative">
      <LooseRing variant={variant} w={{ base: '188px', md: '232px' }} h="auto" />
      <Stack spacing={2.5} align="center" sx={{ textWrap: 'balance' }}>
        <Eyebrow>{screen.eyebrow}</Eyebrow>
        <Heading as={headingAs} fontSize={{ base: '2xl', md: '3xl' }} letterSpacing="-0.02em" lineHeight="1.2">
          {screen.title}
        </Heading>
        <Text color="text.muted" fontSize={{ base: 'md', md: 'lg' }} lineHeight="1.6">{screen.body}</Text>
      </Stack>
      {screen.showDetail && detail && (
        <Box as="code" display="block" w="full" maxH="7.5rem" overflowY="auto" textAlign="left"
          fontFamily="mono" fontSize="xs" lineHeight="1.6" color="text.muted" whiteSpace="pre-wrap"
          overflowWrap="anywhere" bg="bg.subtle" borderWidth="1px" borderColor="border.default"
          borderRadius="lg" px={3} py={2}>
          {detail}
        </Box>
      )}
      <Flex gap={3} wrap="wrap" justify="center" w="full">
        {screen.actions.map((a) => (
          <ActionButton key={a.id} label={a.label} primary={a.primary} handler={all[a.id]} />
        ))}
      </Flex>
    </Stack>
  )

  if (!fullPage) {
    return (
      <Flex position="relative" overflow="hidden" justify="center" px={2} py={{ base: 6, md: 12 }}>
        <BrandGlow top={0} left={0} w="full" h="70%" />
        {content}
      </Flex>
    )
  }

  return (
    <Flex direction="column" minH="100dvh" bg="bg.canvas">
      {header ?? (
        <Flex as="header" h="60px" px={{ base: 4, md: 6 }} align="center" w="full" maxW="6xl" mx="auto">
          <Logo size={28} />
        </Flex>
      )}
      <Flex as="main" flex="1" position="relative" overflow="hidden" align="center" justify="center"
        px={4} pt={{ base: 6, md: 8 }} pb={{ base: 20, md: 24 }}>
        <BrandGlow top="34%" left="50%" transform="translate(-50%, -50%)"
          w={{ base: '140%', md: '720px' }} h={{ base: '70%', md: '560px' }} />
        {content}
      </Flex>
    </Flex>
  )
}
