import { Link as RouterLink } from 'react-router-dom'
import { Button, Flex, Heading, Stack, Text } from '@chakra-ui/react'
import BrandGlow from './BrandGlow.jsx'
import Eyebrow from './Eyebrow.jsx'
import Logo from './Logo.jsx'
import LooseRing from './LooseRing.jsx'
import { errorScreen } from './errorScreens.js'
import { MAIN_ID } from './SkipLink.jsx'

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
// defaults). No technical message is ever shown: the error boundary logs it
// to the console instead. `fullPage` fills the viewport with a header (`header`, else a plain logo
// bar); otherwise it sits inside the app shell's content column.
export default function ErrorScreen({
  variant, signedIn = false, handlers, fullPage = false, header, headingAs = 'h1',
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
      <Flex as="main" id={MAIN_ID} flex="1" position="relative" overflow="hidden" align="center" justify="center"
        px={4} pt={{ base: 6, md: 8 }} pb={{ base: 20, md: 24 }}>
        <BrandGlow top="34%" left="50%" transform="translate(-50%, -50%)"
          w={{ base: '140%', md: '720px' }} h={{ base: '70%', md: '560px' }} />
        {content}
      </Flex>
    </Flex>
  )
}
