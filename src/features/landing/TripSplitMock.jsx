import { AvatarGroup, Box, HStack, Stack, Text } from '@chakra-ui/react'
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
import { MotionBox, popIn, usePhases, usePlayback } from '../../shared/ui/kit/motion.jsx'
import { formatMoney } from '../../shared/lib/currency.js'
import { buildTripDemo } from './landingDemo.js'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'
import useDemoPerson from './useDemoPerson.js'
import PhoneFrame, { SCREEN_CARD } from './PhoneFrame.jsx'

const TRIP = buildTripDemo()
const LAST = TRIP.steps.length // phase index of the settle-up plan
const money = (minor) => formatMoney(minor, TRIP.currency)

// ms each phase is held before advancing; the settle-up plan lingers longest.
const STEP_MS = 1600
const SETTLE_MS = 4200
const HOLDS = [...Array(LAST).fill(STEP_MS), SETTLE_MS]

function Balances({ step }) {
  const t = useT('landing')
  const person = useDemoPerson()
  const owedToYou = step.settlements.find((s) => s.to === 'you')
  return (
    <Stack spacing={3}>
      <SectionLabel>{t('demo.balances')}</SectionLabel>
      <BalanceGrid>
        {step.balances.map((b) => {
          const { text, tone } = signedAmount(b.netMinor, money)
          return <BalanceTile key={b.id} label={person(b.id)} value={text} tone={tone} />
        })}
      </BalanceGrid>
      {owedToYou && (
        <HighlightPill amount={money(owedToYou.amountMinor)}>
          {t('demo.owesYou', { name: person(owedToYou.from) })}
        </HighlightPill>
      )}
    </Stack>
  )
}

function SettlePlan({ step }) {
  const t = useT('landing')
  const person = useDemoPerson()
  return (
    <Stack spacing={3}>
      <SectionLabel>{t('demo.settleUp', { count: step.settlements.length })}</SectionLabel>
      {step.settlements.map((s) => (
        <TransferRow key={`${s.from}-${s.to}`} amount={money(s.amountMinor)}
          from={{ name: person(s.from), highlight: s.from === 'you' }}
          to={{ name: person(s.to), highlight: s.to === 'you' }} />
      ))}
    </Stack>
  )
}

// Hero mockup: a phone-style group card where the trip's expenses land one by
// one, balances update, and it ends on the settle-up plan — then loops.
export default function TripSplitMock() {
  const t = useT('landing')
  const person = useDemoPerson()
  const groupName = t('demo.trip.name')
  const playback = usePlayback()
  // Phase k < LAST shows the state after k+1 expenses; LAST is the settle-up.
  const shown = usePhases(playback, HOLDS)
  const step = TRIP.steps[Math.min(shown, LAST - 1)]

  const settling = shown >= LAST
  const anim = popIn(playback)

  return (
    <PhoneFrame ref={playback.ref} label={t('demo.trip.label', { name: groupName })}>
      <HStack px={4} pt={3} pb={3} spacing={3}>
        <IconTile icon={Plane} size={40} variant="solid" radius="xl" />
        <Box flex="1" minW={0}>
          <Text fontFamily="heading" fontWeight="700">{groupName}</Text>
          <AvatarGroup size="xs" max={4} spacing={-2} mt={1}>
            {TRIP.members.map((m) => (
              <UserAvatar key={m.id} name={person(m.id)} highlight={m.id === 'you'} />
            ))}
          </AvatarGroup>
        </Box>
        <Figure label={t('demo.total')} value={money(step.totalMinor)} align="right" />
      </HStack>

      <Panel {...SCREEN_CARD} p={0} px={3.5} py={1}>
        <Box minH="208px">
          <AnimatePresence initial={false}>
            {step.expenses.map((e) => (
              <MotionBox key={e.id} {...anim}>
                <ItemRow icon={Receipt} title={t(`demo.trip.${e.id}`)}
                  meta={t('demo.paidBy', { name: person(e.paidBy) })}
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
    </PhoneFrame>
  )
}
