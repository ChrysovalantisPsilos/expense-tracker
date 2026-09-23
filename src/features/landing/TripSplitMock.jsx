import { useEffect, useState } from 'react'
import { AvatarGroup, Box, Flex, HStack, Stack, Text } from '@chakra-ui/react'
import { AnimatePresence } from 'framer-motion'
import { Plane, Receipt } from 'lucide-react'
import UserAvatar from '../../shared/ui/UserAvatar.jsx'
import Figure from '../../shared/ui/kit/Figure.jsx'
import HighlightPill from '../../shared/ui/kit/HighlightPill.jsx'
import IconTile from '../../shared/ui/kit/IconTile.jsx'
import ItemRow from '../../shared/ui/kit/ItemRow.jsx'
import Panel from '../../shared/ui/kit/Panel.jsx'
import SectionLabel from '../../shared/ui/kit/SectionLabel.jsx'
import TransferRow from '../../shared/ui/kit/TransferRow.jsx'
import { BalanceGrid, BalanceTile } from '../../shared/ui/kit/Balances.jsx'
import { signedAmount } from '../../shared/ui/kit/kitMath.js'
import { MotionBox, usePlayback } from '../../shared/ui/kit/motion.jsx'
import { formatMoney } from '../../shared/lib/currency.js'
import { buildTripDemo } from './landingDemo.js'

const TRIP = buildTripDemo()
const LAST = TRIP.steps.length // phase index of the settle-up plan
const nameOf = Object.fromEntries(TRIP.members.map((m) => [m.id, m.name]))
const money = (minor) => formatMoney(minor, TRIP.currency)

// ms each phase is held before advancing; the settle-up plan lingers longest.
const STEP_MS = 1600
const SETTLE_MS = 4200

const pop = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0 },
  transition: { duration: 0.35, ease: 'easeOut' },
}

function Balances({ step }) {
  const owedToYou = step.settlements.find((s) => s.to === 'you')
  return (
    <Stack spacing={3}>
      <SectionLabel>Balances</SectionLabel>
      <BalanceGrid>
        {step.balances.map((b) => {
          const { text, tone } = signedAmount(b.netMinor, money)
          return <BalanceTile key={b.id} label={b.name} value={text} tone={tone} />
        })}
      </BalanceGrid>
      {owedToYou && (
        <HighlightPill amount={money(owedToYou.amountMinor)}>{owedToYou.fromName} owes you</HighlightPill>
      )}
    </Stack>
  )
}

function SettlePlan({ step }) {
  return (
    <Stack spacing={3}>
      <SectionLabel>Settle up · {step.settlements.length} payments</SectionLabel>
      {step.settlements.map((s) => (
        <TransferRow key={`${s.from}-${s.to}`} amount={money(s.amountMinor)}
          from={{ name: s.fromName, highlight: s.from === 'you' }}
          to={{ name: s.toName, highlight: s.to === 'you' }} />
      ))}
    </Stack>
  )
}

// Inner cards of the phone screen: white, hairline-bordered, no shadow.
const SCREEN_CARD = { elevation: 'none', borderRadius: 'xl', mx: 2.5, mb: 2.5 }

// Hero mockup: a phone-style group card where the trip's expenses land one by
// one, balances update, and it ends on the settle-up plan — then loops.
export default function TripSplitMock() {
  const { ref, reduce, playing } = usePlayback()
  // Phase k < LAST shows the state after k+1 expenses; LAST is the settle-up.
  const [phase, setPhase] = useState(reduce ? LAST : 0)
  const shown = reduce ? LAST : phase
  const step = TRIP.steps[Math.min(shown, LAST - 1)]

  useEffect(() => {
    if (!playing) return undefined
    const t = setTimeout(
      () => setPhase((p) => (p >= LAST ? 0 : p + 1)),
      phase >= LAST ? SETTLE_MS : STEP_MS,
    )
    return () => clearTimeout(t)
  }, [playing, phase])

  const settling = shown >= LAST
  const anim = reduce ? { initial: false } : pop

  return (
    <Box ref={ref} position="relative" w="full" maxW="360px" mx="auto"
      role="img" aria-label={`Example group "${TRIP.groupName}": four friends split trip expenses and see who owes what.`}>
      <Box
        bg="bg.surface" borderWidth="1px" borderColor="border.default"
        borderRadius="2.25rem" boxShadow="lifted" p={2.5}
      >
        <Box bg="bg.canvas" borderRadius="1.75rem" overflow="hidden" aria-hidden>
          <Flex justify="center" pt={2.5}>
            <Box w="72px" h="5px" borderRadius="full" bg="border.default" />
          </Flex>

          <HStack px={4} pt={3} pb={3} spacing={3}>
            <IconTile icon={Plane} size={40} variant="solid" radius="xl" />
            <Box flex="1" minW={0}>
              <Text fontFamily="heading" fontWeight="700">{TRIP.groupName}</Text>
              <AvatarGroup size="xs" max={4} spacing={-2} mt={1}>
                {TRIP.members.map((m) => (
                  <UserAvatar key={m.id} name={m.name} highlight={m.id === 'you'} />
                ))}
              </AvatarGroup>
            </Box>
            <Figure label="Total" value={money(step.totalMinor)} align="right" />
          </HStack>

          <Panel {...SCREEN_CARD} p={0} px={3.5} py={1}>
            <Box minH="208px">
              <AnimatePresence initial={false}>
                {step.expenses.map((e) => (
                  <MotionBox key={e.id} {...anim}>
                    <ItemRow icon={Receipt} title={e.label} meta={`Paid by ${nameOf[e.paidBy]}`}
                      amount={money(e.amountMinor)} />
                  </MotionBox>
                ))}
              </AnimatePresence>
            </Box>
          </Panel>

          <Panel {...SCREEN_CARD} p={3.5} minH="196px">
            <AnimatePresence mode="wait" initial={false}>
              <MotionBox key={settling ? 'settle' : 'balances'} {...anim}>
                {settling ? <SettlePlan step={step} /> : <Balances step={step} />}
              </MotionBox>
            </AnimatePresence>
          </Panel>
        </Box>
      </Box>
    </Box>
  )
}
