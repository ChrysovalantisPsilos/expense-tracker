import {
  AvatarGroup, Box, Container, Flex, Heading, HStack, SimpleGrid, Stack, Text,
} from '@chakra-ui/react'
import { AnimatePresence } from 'framer-motion'
import { ArrowRight, Check, Copy, HandCoins, Link2, ReceiptText } from 'lucide-react'
import IconTile from '../../shared/ui/kit/IconTile.jsx'
import HighlightPill from '../../shared/ui/kit/HighlightPill.jsx'
import ItemRow from '../../shared/ui/kit/ItemRow.jsx'
import UserAvatar from '../../shared/ui/UserAvatar.jsx'
import { BalanceGrid, BalanceTile } from '../../shared/ui/kit/Balances.jsx'
import { signedAmount } from '../../shared/ui/kit/kitMath.js'
import { MotionBox, Reveal, popIn, usePhases, usePlayback } from '../../shared/ui/kit/motion.jsx'
import { formatMoney } from '../../shared/lib/currency.js'
import { DEMO_CURRENCY, settleDemo, splitDemo } from './landingDemo.js'
import SectionHeading from './SectionHeading.jsx'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'
import useDemoPerson from './useDemoPerson.js'

const money = (minor) => formatMoney(minor, DEMO_CURRENCY)
const SPLIT = splitDemo()
const SETTLE = settleDemo()
const FRIENDS = SPLIT.members.slice(1) // everyone but "You"

// ms each phase is held; the last (the step's result) lingers before looping.
const INVITE_HOLDS = [1100, 900, 650, 650, 2800]
const SPLIT_HOLDS = [600, 1100, 1100, 3000]
const SETTLE_HOLDS = [1300, ...SETTLE.payments.map(() => 1300), 2800]

// The link the first illustration copies: an address, not words to translate.
const INVITE_URL = 'budgeer.com/join/…'

// Every illustration gets the same fixed box, so nothing below it moves.
function Stage({ children }) {
  return (
    <Box h="168px" p={3} bg="bg.surface" borderRadius="xl" borderWidth="1px" borderColor="border.default"
      overflow="hidden" aria-hidden>
      {children}
    </Box>
  )
}

// Step 1: the invite link is copied, then friends join one by one.
function InviteAnim({ playback }) {
  const t = useT('landing')
  const person = useDemoPerson()
  const phase = usePhases(playback, INVITE_HOLDS)
  const copied = phase >= 1
  const joined = FRIENDS.slice(0, Math.max(0, phase - 1))
  const anim = popIn(playback)
  return (
    <Stack spacing={3}>
      <HStack spacing={2} px={2.5} h="40px" borderRadius="lg" bg="bg.subtle" minW={0}>
        <Box color="accent.fg" flexShrink={0}><Link2 size={16} /></Box>
        <Text fontSize="sm" color="text.muted" flex="1" minW={0} noOfLines={1}>{INVITE_URL}</Text>
        <HStack spacing={1} px={2} h="26px" borderRadius="md" flexShrink={0} fontSize="xs" fontWeight="700"
          bg={copied ? 'status.positive' : 'brand.500'} color={copied ? 'bg.surface' : 'white'} transition="background 0.25s">
          {copied ? <Check size={13} /> : <Copy size={13} />}
          <Text as="span">{t(copied ? 'how.invite.copied' : 'how.invite.copy')}</Text>
        </HStack>
      </HStack>
      <HStack justify="space-between" minH="40px">
        <AvatarGroup size="sm" spacing={-2}>
          <UserAvatar name={person('you')} highlight />
          {FRIENDS.map((f, i) => (
            <UserAvatar key={f.id} name={person(f.id)} opacity={i < joined.length ? 1 : 0}
              transform={i < joined.length ? 'scale(1)' : 'scale(0.6)'}
              transition={playback.reduce ? undefined : 'opacity 0.3s, transform 0.3s'} />
          ))}
        </AvatarGroup>
        <Box minW="120px" textAlign="right">
          <AnimatePresence mode="wait" initial={false}>
            <MotionBox key={joined.length} {...anim}>
              <Text fontSize="sm" fontWeight="600" color={joined.length ? 'text.primary' : 'text.muted'}>
                {joined.length ? t('how.invite.joined', { name: person(joined.at(-1).id) }) : t('how.invite.share')}
              </Text>
            </MotionBox>
          </AnimatePresence>
        </Box>
      </HStack>
      <Text fontSize="xs" color="text.muted">
        {t(joined.length === FRIENDS.length ? 'how.invite.allIn' : 'how.invite.freeAccount')}
      </Text>
    </Stack>
  )
}

// Step 2: an expense lands, gets split equally, and your share is counted.
function SplitAnim({ playback }) {
  const t = useT('landing')
  const person = useDemoPerson()
  const phase = usePhases(playback, SPLIT_HOLDS)
  const anim = popIn(playback)
  const you = SPLIT.members[0]
  return (
    <Stack spacing={2}>
      <Box minH="48px">
        <AnimatePresence initial={false}>
          {phase >= 1 && (
            <MotionBox key="row" {...anim}>
              <ItemRow icon={ReceiptText} title={t('demo.groceriesForFlat')}
                meta={t('demo.paidBy', { name: person(SPLIT.paidBy) })}
                amount={money(SPLIT.amountMinor)} />
            </MotionBox>
          )}
        </AnimatePresence>
      </Box>
      <Box minH="32px">
        <AnimatePresence initial={false}>
          {phase >= 2 && (
            <MotionBox key="split" {...anim}>
              <HStack spacing={2}>
                <AvatarGroup size="xs" spacing={-1.5}>
                  {SPLIT.members.map((m) => <UserAvatar key={m.id} name={person(m.id)} highlight={m.id === 'you'} />)}
                </AvatarGroup>
                <Text fontSize="sm" color="text.muted">{t('how.split.equally', { amount: money(you.shareMinor) })}</Text>
              </HStack>
            </MotionBox>
          )}
        </AnimatePresence>
      </Box>
      <Box minH="40px">
        <AnimatePresence initial={false}>
          {phase >= 3 && (
            <MotionBox key="share" {...anim}>
              <HighlightPill amount={money(you.shareMinor)} py={1.5}>{t('how.split.yourShare')}</HighlightPill>
            </MotionBox>
          )}
        </AnimatePresence>
      </Box>
    </Stack>
  )
}

// Step 3: each payment clears a balance, until everyone is at zero.
function SettleAnim({ playback }) {
  const t = useT('landing')
  const person = useDemoPerson()
  const phase = usePhases(playback, SETTLE_HOLDS)
  const anim = popIn(playback)
  const paid = Math.min(phase, SETTLE.payments.length)
  const done = phase > SETTLE.payments.length
  const payment = SETTLE.payments[phase - 1]
  return (
    <Stack spacing={2}>
      <Flex h="26px" align="center">
        <AnimatePresence mode="wait" initial={false}>
          <MotionBox key={done ? 'done' : phase} {...anim}>
            {done ? (
              <HStack spacing={1.5} color="status.positive" fontSize="sm" fontWeight="700">
                <Check size={16} /><Text as="span">{t('how.settle.done')}</Text>
              </HStack>
            ) : payment ? (
              <HStack spacing={1.5} fontSize="sm" fontWeight="600">
                <Text as="span">{person(payment.from)}</Text>
                <Box color="text.muted"><ArrowRight size={14} /></Box>
                <Text as="span">{person(payment.to)}</Text>
                <Text as="span" color="accent.fg" fontWeight="800">{money(payment.amountMinor)}</Text>
              </HStack>
            ) : (
              <Text fontSize="sm" color="text.muted">{t('how.settle.payments', { count: SETTLE.payments.length })}</Text>
            )}
          </MotionBox>
        </AnimatePresence>
      </Flex>
      <BalanceGrid>
        {SETTLE.frames[paid].map((b) => {
          const { text, tone } = signedAmount(b.netMinor, money)
          return <BalanceTile key={b.id} label={person(b.id)} value={text} tone={tone} py={1} />
        })}
      </BalanceGrid>
    </Stack>
  )
}

// Each step's words are how.<id>.title / .body (landing namespace).
const STEPS = [
  { id: 'invite', icon: Link2, Anim: InviteAnim },
  { id: 'split', icon: ReceiptText, Anim: SplitAnim },
  { id: 'settle', icon: HandCoins, Anim: SettleAnim },
]

// One step card. It fades in once it scrolls into view (later cards a beat
// after earlier ones, so a row of three staggers), and its illustration
// loops only while the card is on screen.
function StepCard({ step, index }) {
  const t = useT('landing')
  const reveal = usePlayback({ once: true, amount: 0.25 })
  const playback = usePlayback()
  const { Anim } = step
  return (
    <Reveal ref={reveal.ref} playback={reveal} delay={0.12 * index} h="full">
      <Stack ref={playback.ref} spacing={3} h="full" p={{ base: 5, md: 6 }} bg="bg.canvas"
        borderRadius="2xl" borderWidth="1px" borderColor="border.default">
        <HStack spacing={3}>
          <IconTile icon={step.icon} size={44} radius="xl" />
          <Text fontFamily="heading" fontWeight="700" color="text.muted" fontSize="sm">
            {t('how.step', { n: index + 1 })}
          </Text>
        </HStack>
        <Heading as="h3" fontSize="lg" lineHeight="1.3">{t(`how.${step.id}.title`)}</Heading>
        <Text color="text.muted" flex="1">{t(`how.${step.id}.body`)}</Text>
        <Stage><Anim playback={playback} /></Stage>
      </Stack>
    </Reveal>
  )
}

// "How it works": the three steps of splitting with friends, revealed in
// turn as they scroll into view, each with a small looping illustration.
// Reduced motion: no reveal, and each illustration shows its final state.
export default function HowItWorks() {
  const t = useT('landing')
  return (
    <Box as="section" bg="bg.surface" borderTopWidth="1px" borderBottomWidth="1px" borderColor="border.default">
      <Container maxW="6xl" px={{ base: 4, md: 6 }} py={{ base: 14, md: 20 }}>
        <SectionHeading eyebrow={t('how.eyebrow')} title={t('how.title')} />
        <SimpleGrid columns={{ base: 1, md: 3 }} spacing={{ base: 4, md: 6 }} mt={{ base: 8, md: 12 }}>
          {STEPS.map((s, i) => <StepCard key={s.id} step={s} index={i} />)}
        </SimpleGrid>
      </Container>
    </Box>
  )
}
