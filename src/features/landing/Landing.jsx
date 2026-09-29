import { Link as RouterLink, useNavigate } from 'react-router-dom'
import {
  Box, Button, Container, Flex, Heading, HStack, Link, SimpleGrid, Stack, Text,
} from '@chakra-ui/react'
import {
  ArchiveRestore, ArrowRight, Download, FileSpreadsheet, Heart, Landmark, LockKeyhole,
  MapPin, PiggyBank, Percent, Repeat, ScanLine, Sparkle, Wrench,
} from 'lucide-react'
import BrandGlow from '../../shared/ui/BrandGlow.jsx'
import IconTile from '../../shared/ui/kit/IconTile.jsx'
import PublicHeader from '../../shared/ui/PublicHeader.jsx'
import ThemeToggle from '../../shared/ui/ThemeToggle.jsx'
import TripSplitMock from './TripSplitMock.jsx'
import BudgetsMock from './BudgetsMock.jsx'
import InsightsMock from './InsightsMock.jsx'
import { STATUS_URL, SUPPORT_EMAIL } from '../../shared/lib/contact.js'
import CurrencyMock from './CurrencyMock.jsx'
import SectionHeading from './SectionHeading.jsx'
import HowItWorks from './HowItWorks.jsx'
import TypeItMock from './TypeItMock.jsx'
import { AI_SWITCHES } from '../ai/aiMath.js'
import { MAIN_ID } from '../../shared/ui/SkipLink.jsx'
import { Trans, useT } from '../../shared/lib/i18n/I18nProvider.jsx'

// Under the AI helpers' words: the three helpers by the names Settings gives
// them, and one line on what they are, linking to the FAQ answer.
function AiHelpersNote() {
  const t = useT('landing')
  return (
    <Stack spacing={4} mt={5} maxW="xl">
      <HStack as="ul" listStyleType="none" spacing={2} rowGap={2} flexWrap="wrap">
        {Object.keys(AI_SWITCHES).map((id) => (
          <HStack as="li" key={id} spacing={1.5} px={3} py={1.5} borderRadius="full" bg="bg.surface"
            borderWidth="1px" borderColor="border.default" fontSize="sm" fontWeight="600">
            <Box as="span" color="accent.fg" display="inline-flex"><Sparkle size={13} fill="currentColor" aria-hidden /></Box>
            <Text as="span">{t(`ai:settings.${id}.label`)}</Text>
          </HStack>
        ))}
      </HStack>
      <Text fontSize="sm" color="text.muted">
        {t('showcase.ai.note')}{' '}
        <Link as={RouterLink} to="/help#ai-helpers" color="accent.fg" fontWeight="600">{t('showcase.ai.how')}</Link>
      </Text>
    </Stack>
  )
}

// The words of each are showcase.<id>.eyebrow / .title / .body (landing
// namespace); `Extra` goes under them.
const SHOWCASE = [
  { id: 'budgets', Mock: BudgetsMock },
  { id: 'insights', Mock: InsightsMock },
  { id: 'currency', Mock: CurrencyMock },
  { id: 'ai', Mock: TypeItMock, Extra: AiHelpersNote },
]

// Real features the showcase doesn't have room for (also.<id>).
const ALSO_INCLUDED = [
  { icon: Landmark, id: 'payBack' },
  { icon: Percent, id: 'splitWays' },
  { icon: ScanLine, id: 'receipts' },
  { icon: FileSpreadsheet, id: 'import' },
  { icon: Repeat, id: 'recurring' },
  { icon: PiggyBank, id: 'savings' },
  { icon: Download, id: 'statements' },
  { icon: ArchiveRestore, id: 'backups' },
  { icon: LockKeyhole, id: 'atRest' },
]

// A quiet pill above the headline saying what Budgeer is, linking to the
// "Who runs Budgeer?" answer in Help & FAQ.
function HobbyBadge() {
  const t = useT()
  return (
    <Link as={RouterLink} to="/help#who-runs-budgeer" alignSelf="flex-start" display="inline-flex"
      alignItems="center" gap={2} px={3} py={1.5} borderRadius="full" fontSize="sm" fontWeight="600"
      color="text.primary" bg="bg.surface" borderWidth="1px" borderColor="border.default" boxShadow="sm"
      _hover={{ textDecoration: 'none', borderColor: 'brand.300' }}>
      <Box as="span" color="accent.fg"><Heart size={14} fill="currentColor" /></Box>
      {t('hobby.badge')}
      <Box as="span" color="text.muted"><ArrowRight size={14} /></Box>
    </Link>
  )
}

// What Budgeer is and isn't, in plain words. Every line here must match the
// Privacy Notice, the Terms and Help & FAQ (honest.<id>.title / .body).
const HONEST_POINTS = [
  { icon: Heart, id: 'free' },
  { icon: Landmark, id: 'notBank' },
  { icon: MapPin, id: 'eu' },
  { icon: Wrench, id: 'care' },
]

function Hero({ onLogin, onSignup }) {
  const t = useT('landing')
  return (
    <Box as="section" position="relative" overflow="hidden">
      <BrandGlow top="-10%" right={{ base: '-40%', lg: '-5%' }} w={{ base: '120%', lg: '60%' }} h="120%" />
      <Container maxW="6xl" px={{ base: 4, md: 6 }} position="relative"
        pt={{ base: 10, md: 16, lg: 20 }} pb={{ base: 14, md: 20 }}>
        <Flex direction={{ base: 'column', lg: 'row' }} align="center" gap={{ base: 12, lg: 16 }}>
          <Stack spacing={6} flex="1.15" maxW={{ base: '2xl', lg: 'none' }}>
            <HobbyBadge />
            <Heading as="h1" fontSize={{ base: '4xl', md: '5xl', xl: '6xl' }} letterSpacing="-0.03em" lineHeight="1.05">
              <Trans t={t} k="hero.title"
                components={{ br: <br />, accent: <Text as="span" color="accent.fg" /> }} />
            </Heading>
            <Text color="text.muted" fontSize={{ base: 'lg', md: 'xl' }} maxW="lg">
              {t('hero.lead')}
            </Text>
            <Stack direction={{ base: 'column', sm: 'row' }} spacing={3} pt={2}>
              <Button size="lg" onClick={onSignup}>{t('hero.start')}</Button>
              <Button size="lg" variant="ghost" onClick={onLogin}>{t('hero.haveAccount')}</Button>
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

function Showcase() {
  const t = useT('landing')
  return (
    <Box as="section">
      <Container maxW="6xl" px={{ base: 4, md: 6 }} py={{ base: 14, md: 24 }}>
        <Stack spacing={{ base: 16, md: 24 }}>
          {SHOWCASE.map(({ id, Mock, Extra }, i) => (
            <Flex key={id} align="center" gap={{ base: 8, md: 12, lg: 16 }}
              direction={{ base: 'column', md: i % 2 ? 'row-reverse' : 'row' }}>
              <Box flex="1" w="full">
                <SectionHeading eyebrow={t(`showcase.${id}.eyebrow`)} title={t(`showcase.${id}.title`)}>
                  {t(`showcase.${id}.body`)}
                </SectionHeading>
                {Extra && <Extra />}
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
  const t = useT('landing')
  return (
    <Box as="section" bg="bg.surface" borderTopWidth="1px" borderBottomWidth="1px" borderColor="border.default">
      <Container maxW="6xl" px={{ base: 4, md: 6 }} py={{ base: 12, md: 16 }}>
        <SectionHeading eyebrow={t('also.eyebrow')} title={t('also.title')} />
        <SimpleGrid as="ul" listStyleType="none" columns={{ base: 1, sm: 2, lg: 3 }}
          spacing={{ base: 3, md: 4 }} mt={{ base: 6, md: 10 }}>
          {ALSO_INCLUDED.map(({ icon, id }) => (
            <HStack as="li" key={id} spacing={3}>
              <IconTile icon={icon} size={36} radius="lg" />
              <Text fontWeight="600">{t(`also.${id}`)}</Text>
            </HStack>
          ))}
        </SimpleGrid>
      </Container>
    </Box>
  )
}

// "Made by one person, for fun": a card before the closing call to action
// saying plainly what Budgeer is and isn't.
function Honest() {
  const t = useT('landing')
  return (
    <Box as="section">
      <Container maxW="6xl" px={{ base: 4, md: 6 }} pt={{ base: 14, md: 20 }}>
        <Box p={{ base: 6, md: 10 }} bg="bg.surface" borderRadius="2xl" borderWidth="1px" borderColor="border.default">
          <Flex direction={{ base: 'column', md: 'row' }} align={{ md: 'flex-end' }} justify="space-between"
            gap={{ base: 4, md: 8 }}>
            <SectionHeading eyebrow={t('common:hobby.title')} title={t('honest.title')}>
              {t('honest.lead')}
            </SectionHeading>
            <HStack spacing={5} rowGap={2} flexWrap="wrap" fontWeight="600" flexShrink={0}>
              <Link as={RouterLink} to="/help#who-runs-budgeer" color="accent.fg">{t('honest.whoRuns')}</Link>
              <Link as={RouterLink} to="/terms" color="accent.fg">{t('honest.terms')}</Link>
            </HStack>
          </Flex>
          <SimpleGrid as="ul" listStyleType="none" columns={{ base: 1, sm: 2, lg: 4 }}
            spacing={{ base: 5, md: 6 }} mt={{ base: 8, md: 10 }}>
            {HONEST_POINTS.map(({ icon, id }) => (
              <Flex as="li" key={id} direction={{ base: 'row', lg: 'column' }} gap={3}>
                <IconTile icon={icon} size={40} radius="lg" />
                <Box minW={0}>
                  <Text fontFamily="heading" fontWeight="700" lineHeight="1.4">{t(`honest.${id}.title`)}</Text>
                  <Text color="text.muted" fontSize="sm" lineHeight="1.6" mt={1}>{t(`honest.${id}.body`)}</Text>
                </Box>
              </Flex>
            ))}
          </SimpleGrid>
        </Box>
      </Container>
    </Box>
  )
}

function ClosingCta({ onSignup }) {
  const t = useT('landing')
  return (
    <Box as="section">
      <Container maxW="6xl" px={{ base: 4, md: 6 }} py={{ base: 14, md: 20 }}>
        <Stack align="center" textAlign="center" spacing={6} px={{ base: 6, md: 12 }} py={{ base: 12, md: 16 }}
          borderRadius="2xl" bg="brand.50" borderWidth="1px" borderColor="brand.100"
          _dark={{ bg: 'rgba(249, 93, 56, 0.10)', borderColor: 'rgba(249, 93, 56, 0.24)' }}>
          <Heading as="h2" fontSize={{ base: '2xl', md: '4xl' }} letterSpacing="-0.02em">
            <Trans t={t} k="closing.title" components={{ accent: <Box as="span" color="accent.fg" /> }} />
          </Heading>
          <Text fontSize={{ base: 'md', md: 'lg' }} color="text.muted" maxW="md">
            {t('closing.lead')}
          </Text>
          <Button size="lg" onClick={onSignup}>
            {t('common:actions.signUp')}
          </Button>
        </Stack>
      </Container>
    </Box>
  )
}

export default function Landing() {
  const t = useT('landing')
  const navigate = useNavigate()
  const onLogin = () => navigate('/login')
  const onSignup = () => navigate('/login?signup=1')

  return (
    <Box minH="100dvh" bg="bg.canvas" overflowX="clip">
      <PublicHeader>
        <Button size="sm" variant="ghost" px={{ base: 2, sm: 3 }} onClick={onLogin}>{t('common:actions.logIn')}</Button>
        <Button size="sm" px={{ base: 3, sm: 4 }} onClick={onSignup}>{t('common:actions.signUp')}</Button>
      </PublicHeader>
      <main id={MAIN_ID}>
        <Hero onLogin={onLogin} onSignup={onSignup} />
        <HowItWorks />
        <Showcase />
        <AlsoIncluded />
        <Honest />
        <ClosingCta onSignup={onSignup} />
      </main>
      <Box as="footer" borderTopWidth="1px" borderColor="border.default">
        <Container maxW="6xl" px={{ base: 4, md: 6 }}>
          <Flex minH="64px" py={3} align="center" justify="space-between">
            <HStack spacing={4} rowGap={1} flexWrap="wrap" fontSize="sm" color="text.muted">
              <Text>© {new Date().getFullYear()} Budgeer</Text>
              <Link as={RouterLink} to="/help">{t('footer.help')}</Link>
              <Link as={RouterLink} to="/help#install-app">{t('footer.install')}</Link>
              <Link as={RouterLink} to="/privacy">{t('footer.privacy')}</Link>
              <Link as={RouterLink} to="/terms">{t('footer.terms')}</Link>
              <Link href={STATUS_URL} isExternal>{t('footer.status')}</Link>
              <Link href={`mailto:${SUPPORT_EMAIL}`}>{t('footer.contact')}</Link>
            </HStack>
            <ThemeToggle />
          </Flex>
          <Text fontSize="xs" color="text.muted" pb={4}>{t('common:hobby.disclaimer')}</Text>
        </Container>
      </Box>
    </Box>
  )
}
