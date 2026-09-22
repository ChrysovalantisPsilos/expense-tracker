import { useEffect, useState } from 'react'
import {
  AvatarGroup, Box, Flex, HStack, SimpleGrid, Stack, Text,
} from '@chakra-ui/react'
import { AnimatePresence } from 'framer-motion'
import { ArrowRight, Plane, Receipt } from 'lucide-react'
import UserAvatar from '../../shared/ui/UserAvatar.jsx'
import { formatMoney } from '../../shared/lib/currency.js'
import { buildTripDemo } from './landingDemo.js'
import { MotionBox, usePlayback } from './motion.jsx'

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

function ExpenseRow({ expense }) {
  return (
    <HStack spacing={3} py={2}>
      <Flex boxSize="32px" borderRadius="lg" bg="bg.subtle" color="accent.fg"
        align="center" justify="center" flexShrink={0}>
        <Receipt size={16} />
      </Flex>
      <Box flex="1" minW={0}>
        <Text fontSize="sm" fontWeight="600" noOfLines={1}>{expense.label}</Text>
        <Text fontSize="xs" color="text.muted">Paid by {nameOf[expense.paidBy]}</Text>
      </Box>
      <Text fontSize="sm" fontWeight="700">{money(expense.amountMinor)}</Text>
    </HStack>
  )
}

function Balances({ step }) {
  const owedToYou = step.settlements.find((s) => s.to === 'you')
  return (
    <Stack spacing={3}>
      <Text fontSize="xs" fontWeight="700" color="text.muted" textTransform="uppercase" letterSpacing="0.06em">
        Balances
      </Text>
      <SimpleGrid columns={2} spacing={2}>
        {step.balances.map((b) => {
          const up = b.netMinor >= 0
          return (
            <Box key={b.id} bg="bg.subtle" borderRadius="lg" px={3} py={2}>
              <Text fontSize="xs" color="text.muted">{b.name}</Text>
              <Text fontSize="sm" fontWeight="700"
                color={up ? 'green.600' : 'red.500'}
                _dark={{ color: up ? 'green.300' : 'red.300' }}>
                {up ? '+' : '−'}{money(Math.abs(b.netMinor))}
              </Text>
            </Box>
          )
        })}
      </SimpleGrid>
      {owedToYou && (
        <Box borderRadius="lg" px={3} py={2} bg="brand.50" _dark={{ bg: 'whiteAlpha.100' }}>
          <Text fontSize="sm" fontWeight="600">
            {owedToYou.fromName} owes you{' '}
            <Text as="span" color="accent.fg" fontWeight="800">{money(owedToYou.amountMinor)}</Text>
          </Text>
        </Box>
      )}
    </Stack>
  )
}

function SettlePlan({ step }) {
  return (
    <Stack spacing={3}>
      <Text fontSize="xs" fontWeight="700" color="text.muted" textTransform="uppercase" letterSpacing="0.06em">
        Settle up · {step.settlements.length} payments
      </Text>
      {step.settlements.map((s) => (
        <HStack key={`${s.from}-${s.to}`} spacing={2} bg="bg.subtle" borderRadius="lg" px={3} py={2.5}>
          <UserAvatar name={s.fromName} size="xs" />
          <Text fontSize="sm" fontWeight="600">{s.fromName}</Text>
          <Box color="text.muted"><ArrowRight size={14} /></Box>
          <UserAvatar name={s.toName} size="xs" highlight={s.to === 'you'} />
          <Text fontSize="sm" fontWeight="600" flex="1">{s.toName}</Text>
          <Text fontSize="sm" fontWeight="800" color="accent.fg">{money(s.amountMinor)}</Text>
        </HStack>
      ))}
    </Stack>
  )
}

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
            <Flex boxSize="40px" borderRadius="xl" bg="brand.500" color="white"
              align="center" justify="center" flexShrink={0}>
              <Plane size={20} />
            </Flex>
            <Box flex="1" minW={0}>
              <Text fontFamily="heading" fontWeight="700" noOfLines={1}>{TRIP.groupName}</Text>
              <AvatarGroup size="xs" max={4} spacing={-2} mt={1}>
                {TRIP.members.map((m) => (
                  <UserAvatar key={m.id} name={m.name} highlight={m.id === 'you'} />
                ))}
              </AvatarGroup>
            </Box>
            <Box textAlign="right">
              <Text fontSize="xs" color="text.muted">Total</Text>
              <Text fontFamily="heading" fontWeight="700">{money(step.totalMinor)}</Text>
            </Box>
          </HStack>

          <Box bg="bg.surface" mx={2.5} mb={2.5} borderRadius="xl" px={3.5} py={1}
            borderWidth="1px" borderColor="border.default">
            <Box minH="208px">
              <AnimatePresence initial={false}>
                {step.expenses.map((e) => (
                  <MotionBox key={e.id} {...anim}>
                    <ExpenseRow expense={e} />
                  </MotionBox>
                ))}
              </AnimatePresence>
            </Box>
          </Box>

          <Box bg="bg.surface" mx={2.5} mb={2.5} borderRadius="xl" p={3.5}
            borderWidth="1px" borderColor="border.default" minH="196px">
            <AnimatePresence mode="wait" initial={false}>
              <MotionBox key={settling ? 'settle' : 'balances'} {...anim}>
                {settling ? <SettlePlan step={step} /> : <Balances step={step} />}
              </MotionBox>
            </AnimatePresence>
          </Box>
        </Box>
      </Box>
    </Box>
  )
}
