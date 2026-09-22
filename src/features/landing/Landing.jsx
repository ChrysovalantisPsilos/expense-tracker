import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box, Button, Container, Flex, Heading, HStack, SimpleGrid, Stack, Text,
} from '@chakra-ui/react'
import { HandCoins, Link2, ReceiptText } from 'lucide-react'
import Logo from '../../shared/ui/Logo.jsx'
import ThemeToggle from '../../shared/ui/ThemeToggle.jsx'
import TripSplitMock from './TripSplitMock.jsx'
import BudgetsMock from './BudgetsMock.jsx'
import InsightsMock from './InsightsMock.jsx'
import CurrencyMock from './CurrencyMock.jsx'

const STEPS = [
  {
    icon: Link2,
    title: 'Create a group & invite friends with a link',
    body: 'Start a group for a trip, your flat or a night out, then share one invite link.',
  },
  {
    icon: ReceiptText,
    title: 'Add expenses as you go',
    body: 'Log who paid and what it was for, right when it happens.',
  },
  {
    icon: HandCoins,
    title: 'See who owes what and settle up',
    body: 'Balances update as you go, and Budgeer works out a simple plan to square up.',
  },
]

const SHOWCASE = [
  {
    eyebrow: 'Budgets & tracking',
    title: 'Know where every euro goes',
    body: 'Log expenses and income, set a monthly budget for each category, and see at a glance when you’re getting close — or already over.',
    Mock: BudgetsMock,
  },
  {
    eyebrow: 'Insights',
    title: 'Your spending, at a glance',
    body: 'See what you spend by category and how this month compares with the last six, so changes never sneak up on you.',
    Mock: InsightsMock,
  },
  {
    eyebrow: 'Multi-currency',
    title: 'Spend abroad, track at home',
    body: 'Add expenses in the currency you paid in. Budgeer converts them to your home currency at that day’s rate, so your totals stay right.',
    Mock: CurrencyMock,
  },
]

function useScrolled() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return scrolled
}

function Nav({ onLogin, onSignup }) {
  const scrolled = useScrolled()
  return (
    <Box as="header" position="sticky" top={0} zIndex="sticky"
      bg="color-mix(in srgb, var(--chakra-colors-bg-canvas) 85%, transparent)"
      backdropFilter="saturate(1.4) blur(12px)"
      borderBottomWidth="1px" borderColor={scrolled ? 'border.default' : 'transparent'}
      transition="border-color 0.2s">
      <Container maxW="6xl" px={{ base: 4, md: 6 }}>
        <Flex h="60px" align="center" gap={{ base: 1, sm: 2 }}>
          <Logo size={28} />
          <Box flex="1" />
          <ThemeToggle />
          <Button size="sm" variant="ghost" px={{ base: 2, sm: 3 }} onClick={onLogin}>Log in</Button>
          <Button size="sm" px={{ base: 3, sm: 4 }} onClick={onSignup}>Get started</Button>
        </Flex>
      </Container>
    </Box>
  )
}

function SectionHeading({ eyebrow, title, children }) {
  return (
    <Stack spacing={3} maxW="xl">
      <Text fontSize="sm" fontWeight="700" color="accent.fg" textTransform="uppercase" letterSpacing="0.08em">
        {eyebrow}
      </Text>
      <Heading as="h2" fontSize={{ base: '2xl', md: '3xl' }} letterSpacing="-0.02em" lineHeight="1.15">
        {title}
      </Heading>
      {children && <Text color="text.muted" fontSize={{ base: 'md', md: 'lg' }}>{children}</Text>}
    </Stack>
  )
}

function Hero({ onLogin, onSignup }) {
  return (
    <Box as="section" position="relative" overflow="hidden">
      <Box position="absolute" top="-10%" right={{ base: '-40%', lg: '-5%' }} w={{ base: '120%', lg: '60%' }} h="120%"
        bgGradient="radial(closest-side, brand.100, transparent)"
        _dark={{ bgGradient: 'radial(closest-side, rgba(249, 93, 56, 0.14), transparent)' }}
        pointerEvents="none" aria-hidden />
      <Container maxW="6xl" px={{ base: 4, md: 6 }} position="relative"
        pt={{ base: 10, md: 16, lg: 20 }} pb={{ base: 14, md: 20 }}>
        <Flex direction={{ base: 'column', lg: 'row' }} align="center" gap={{ base: 12, lg: 16 }}>
          <Stack spacing={6} flex="1.15" maxW={{ base: '2xl', lg: 'none' }}>
            <Heading as="h1" fontSize={{ base: '4xl', md: '5xl', xl: '6xl' }} letterSpacing="-0.03em" lineHeight="1.05">
              Track your money.<br />
              <Text as="span" color="accent.fg">Split with friends.</Text>
            </Heading>
            <Text color="text.muted" fontSize={{ base: 'lg', md: 'xl' }} maxW="lg">
              A free expense tracker and bill splitter. Log what you spend, set
              budgets, and settle up with friends — all in one app.
            </Text>
            <Stack direction={{ base: 'column', sm: 'row' }} spacing={3} pt={2}>
              <Button size="lg" onClick={onSignup}>Get started — it’s free</Button>
              <Button size="lg" variant="ghost" onClick={onLogin}>I already have an account</Button>
            </Stack>
          </Stack>
          <Box flex="1" w="full">
            <TripSplitMock />
          </Box>
        </Flex>
      </Container>
    </Box>
  )
}

function HowItWorks() {
  return (
    <Box as="section" bg="bg.surface" borderTopWidth="1px" borderBottomWidth="1px" borderColor="border.default">
      <Container maxW="6xl" px={{ base: 4, md: 6 }} py={{ base: 14, md: 20 }}>
        <SectionHeading eyebrow="How it works" title="Shared costs, sorted in three steps" />
        <SimpleGrid columns={{ base: 1, md: 3 }} spacing={{ base: 4, md: 6 }} mt={{ base: 8, md: 12 }}>
          {STEPS.map((s, i) => (
            <Stack key={s.title} spacing={3} p={{ base: 5, md: 6 }} bg="bg.canvas"
              borderRadius="2xl" borderWidth="1px" borderColor="border.default">
              <HStack spacing={3}>
                <Flex boxSize="44px" borderRadius="xl" bg="bg.subtle" color="accent.fg"
                  align="center" justify="center" flexShrink={0}>
                  <s.icon size={22} />
                </Flex>
                <Text fontFamily="heading" fontWeight="700" color="text.muted" fontSize="sm">
                  Step {i + 1}
                </Text>
              </HStack>
              <Heading as="h3" fontSize="lg" lineHeight="1.3">{s.title}</Heading>
              <Text color="text.muted">{s.body}</Text>
            </Stack>
          ))}
        </SimpleGrid>
      </Container>
    </Box>
  )
}

function Showcase() {
  return (
    <Box as="section">
      <Container maxW="6xl" px={{ base: 4, md: 6 }} py={{ base: 14, md: 24 }}>
        <Stack spacing={{ base: 16, md: 24 }}>
          {SHOWCASE.map(({ eyebrow, title, body, Mock }, i) => (
            <Flex key={eyebrow} align="center" gap={{ base: 8, md: 12, lg: 16 }}
              direction={{ base: 'column', md: i % 2 ? 'row-reverse' : 'row' }}>
              <Box flex="1" w="full">
                <SectionHeading eyebrow={eyebrow} title={title}>{body}</SectionHeading>
              </Box>
              <Box flex="1" w="full">
                <Mock />
              </Box>
            </Flex>
          ))}
        </Stack>
      </Container>
    </Box>
  )
}

function ClosingCta({ onSignup }) {
  return (
    <Box as="section">
      <Container maxW="6xl" px={{ base: 4, md: 6 }} pb={{ base: 14, md: 20 }}>
        <Stack align="center" textAlign="center" spacing={6} px={{ base: 6, md: 12 }} py={{ base: 12, md: 16 }}
          borderRadius="2xl" bg="brand.500" color="white" boxShadow="lifted"
          bgGradient="linear(to-br, brand.400, brand.600)">
          <Heading as="h2" fontSize={{ base: '2xl', md: '4xl' }} letterSpacing="-0.02em">
            Start splitting — it’s free
          </Heading>
          <Text fontSize={{ base: 'md', md: 'lg' }} opacity={0.9} maxW="md">
            Create your first group and invite friends with a link.
          </Text>
          <Button size="lg" bg="white" color="brand.700"
            _hover={{ bg: 'brand.50' }} _active={{ bg: 'brand.100' }} onClick={onSignup}>
            Get started
          </Button>
        </Stack>
      </Container>
    </Box>
  )
}

export default function Landing() {
  const navigate = useNavigate()
  const onLogin = () => navigate('/login')
  const onSignup = () => navigate('/login?signup=1')

  return (
    <Box minH="100dvh" bg="bg.canvas" overflowX="clip">
      <Nav onLogin={onLogin} onSignup={onSignup} />
      <main>
        <Hero onLogin={onLogin} onSignup={onSignup} />
        <HowItWorks />
        <Showcase />
        <ClosingCta onSignup={onSignup} />
      </main>
      <Box as="footer" borderTopWidth="1px" borderColor="border.default">
        <Container maxW="6xl" px={{ base: 4, md: 6 }}>
          <Flex h="64px" align="center" justify="space-between">
            <Text fontSize="sm" color="text.muted">© {new Date().getFullYear()} Budgeer</Text>
            <ThemeToggle />
          </Flex>
        </Container>
      </Box>
    </Box>
  )
}
