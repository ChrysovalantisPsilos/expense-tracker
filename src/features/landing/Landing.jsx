import { Link as RouterLink, useNavigate } from 'react-router-dom'
import {
  Box, Button, Container, Flex, Heading, HStack, Link, SimpleGrid, Stack, Text,
} from '@chakra-ui/react'
import {
  ArchiveRestore, Download, FileSpreadsheet, HandCoins, Landmark, Link2, LockKeyhole, PiggyBank,
  Percent, Repeat, ReceiptText, ScanLine,
} from 'lucide-react'
import BrandGlow from '../../shared/ui/BrandGlow.jsx'
import IconTile from '../../shared/ui/kit/IconTile.jsx'
import PublicHeader from '../../shared/ui/PublicHeader.jsx'
import ThemeToggle from '../../shared/ui/ThemeToggle.jsx'
import { DISCLAIMER } from '../../shared/lib/disclaimer.js'
import TripSplitMock from './TripSplitMock.jsx'
import BudgetsMock from './BudgetsMock.jsx'
import InsightsMock from './InsightsMock.jsx'
import { SUPPORT_EMAIL } from '../../shared/lib/contact.js'
import CurrencyMock from './CurrencyMock.jsx'
import SectionHeading from './SectionHeading.jsx'
import Comparison from './Comparison.jsx'

const STEPS = [
  {
    icon: Link2,
    title: 'Create a group & invite friends with a link',
    body: 'Create a group for a trip, your flat or a night out, share one invite link, and friends join with a free account.',
  },
  {
    icon: ReceiptText,
    title: 'Add expenses as you go',
    body: 'Log who paid, in any currency. Split equally, or by amount, percentage or shares.',
  },
  {
    icon: HandCoins,
    title: 'See who owes what and settle up',
    body: 'Budgeer works out the fewest payments to square up, and shows each friend’s IBAN, Revolut or PayPal to pay back.',
  },
]

const SHOWCASE = [
  {
    eyebrow: 'Budgets & tracking',
    title: 'Know where every euro goes',
    body: 'Log expenses and income and set a monthly budget for each category — it carries over to the next month. Bars turn amber at 80% and red when you’re over, and Budgeer notifies you when you cross either line.',
    Mock: BudgetsMock,
  },
  {
    eyebrow: 'Insights',
    title: 'Your spending, at a glance',
    body: 'See what you spend by category and your last six months side by side, with the change from last month.',
    Mock: InsightsMock,
  },
  {
    eyebrow: 'Multi-currency',
    title: 'Spend abroad, track at home',
    body: 'Add expenses in the currency you paid in, on your own or in a group. Budgeer converts them at the European Central Bank rate for that day, and each one keeps its rate, so past totals never shift.',
    Mock: CurrencyMock,
  },
]

// Real features the showcase doesn't have room for.
const ALSO_INCLUDED = [
  { icon: Landmark, label: 'Pay back by IBAN, Revolut or PayPal' },
  { icon: Percent, label: 'Split by amount, percent or shares' },
  { icon: ScanLine, label: 'Receipt scan on your device' },
  { icon: FileSpreadsheet, label: 'Import from CSV or Excel' },
  { icon: Repeat, label: 'Recurring payments' },
  { icon: PiggyBank, label: 'Savings goals and net worth' },
  { icon: Download, label: 'PDF and Excel statements' },
  { icon: ArchiveRestore, label: 'Encrypted backups' },
  { icon: LockKeyhole, label: 'Encrypted at rest' },
]

function Hero({ onLogin, onSignup }) {
  return (
    <Box as="section" position="relative" overflow="hidden">
      <BrandGlow top="-10%" right={{ base: '-40%', lg: '-5%' }} w={{ base: '120%', lg: '60%' }} h="120%" />
      <Container maxW="6xl" px={{ base: 4, md: 6 }} position="relative"
        pt={{ base: 10, md: 16, lg: 20 }} pb={{ base: 14, md: 20 }}>
        <Flex direction={{ base: 'column', lg: 'row' }} align="center" gap={{ base: 12, lg: 16 }}>
          <Stack spacing={6} flex="1.15" maxW={{ base: '2xl', lg: 'none' }}>
            <Heading as="h1" fontSize={{ base: '4xl', md: '5xl', xl: '6xl' }} letterSpacing="-0.03em" lineHeight="1.05">
              Track your money.<br />
              <Text as="span" color="accent.fg">Split with friends.</Text>
            </Heading>
            <Text color="text.muted" fontSize={{ base: 'lg', md: 'xl' }} maxW="lg">
              A free expense tracker and bill splitter. Log spending and income, set
              budgets, split trips and flats with friends, and pay them back by
              IBAN, Revolut or PayPal in a tap. No limits, no ads.
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
                <IconTile icon={s.icon} size={44} radius="xl" />
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
                <Box maxW="420px" mx="auto">
                  <Mock />
                </Box>
              </Box>
            </Flex>
          ))}
        </Stack>
      </Container>
    </Box>
  )
}

function AlsoIncluded() {
  return (
    <Box as="section" bg="bg.surface" borderTopWidth="1px" borderBottomWidth="1px" borderColor="border.default">
      <Container maxW="6xl" px={{ base: 4, md: 6 }} py={{ base: 12, md: 16 }}>
        <SectionHeading eyebrow="Also included" title="Everything else, free too" />
        <SimpleGrid as="ul" listStyleType="none" columns={{ base: 1, sm: 2, lg: 3 }}
          spacing={{ base: 3, md: 4 }} mt={{ base: 6, md: 10 }}>
          {ALSO_INCLUDED.map(({ icon, label }) => (
            <HStack as="li" key={label} spacing={3}>
              <IconTile icon={icon} size={36} radius="lg" />
              <Text fontWeight="600">{label}</Text>
            </HStack>
          ))}
        </SimpleGrid>
      </Container>
    </Box>
  )
}

function ClosingCta({ onSignup }) {
  return (
    <Box as="section">
      <Container maxW="6xl" px={{ base: 4, md: 6 }} py={{ base: 14, md: 20 }}>
        <Stack align="center" textAlign="center" spacing={6} px={{ base: 6, md: 12 }} py={{ base: 12, md: 16 }}
          borderRadius="2xl" bg="brand.500" color="white" boxShadow="lifted"
          bgGradient="linear(to-br, brand.400, brand.600)">
          <Heading as="h2" fontSize={{ base: '2xl', md: '4xl' }} letterSpacing="-0.02em">
            Start splitting — it’s free
          </Heading>
          <Text fontSize={{ base: 'md', md: 'lg' }} opacity={0.9} maxW="md">
            Create your first group and invite friends with a link. No limits, no ads.
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
      <PublicHeader>
        <Button size="sm" variant="ghost" px={{ base: 2, sm: 3 }} onClick={onLogin}>Log in</Button>
        <Button size="sm" px={{ base: 3, sm: 4 }} onClick={onSignup}>Get started</Button>
      </PublicHeader>
      <main>
        <Hero onLogin={onLogin} onSignup={onSignup} />
        <HowItWorks />
        <Showcase />
        <AlsoIncluded />
        <Comparison />
        <ClosingCta onSignup={onSignup} />
      </main>
      <Box as="footer" borderTopWidth="1px" borderColor="border.default">
        <Container maxW="6xl" px={{ base: 4, md: 6 }}>
          <Flex minH="64px" py={3} align="center" justify="space-between">
            <HStack spacing={4} rowGap={1} flexWrap="wrap" fontSize="sm" color="text.muted">
              <Text>© {new Date().getFullYear()} Budgeer</Text>
              <Link as={RouterLink} to="/help">Help</Link>
              <Link as={RouterLink} to="/privacy">Privacy</Link>
              <Link as={RouterLink} to="/terms">Terms</Link>
              <Link href={`mailto:${SUPPORT_EMAIL}`}>Contact</Link>
            </HStack>
            <ThemeToggle />
          </Flex>
          <Text fontSize="xs" color="text.muted" pb={4}>{DISCLAIMER}</Text>
        </Container>
      </Box>
    </Box>
  )
}
