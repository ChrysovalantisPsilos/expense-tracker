import { useMemo } from 'react'
import { Box, Center, Flex, HStack, Text } from '@chakra-ui/react'
import { keyframes } from '@emotion/react'
import { ArrowRight, Sparkle } from 'lucide-react'
import CategoryBadge from '../../shared/ui/CategoryBadge.jsx'
import Panel from '../../shared/ui/kit/Panel.jsx'
import { RingMark, RingSpinner } from '../../shared/ui/RingLoader.jsx'
import { usePhases, usePlayback } from '../../shared/ui/kit/motion.jsx'
import { formatMoney } from '../../shared/lib/currency.js'
import { shortDate } from '../../shared/lib/dates.js'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'
import SuggestedMark from '../ai/SuggestedMark.jsx'
import PhoneFrame, { SCREEN_CARD } from './PhoneFrame.jsx'
import { DEMO_CURRENCY } from './landingDemo.js'
import {
  DEMO_TODAY, FORM_FIELDS, TYPE_IT_EXAMPLES, fieldsFor, restFrameIndex, typeItFrames,
} from './aiDemo.js'

const money = (minor) => formatMoney(minor, DEMO_CURRENCY)
const [TY, TM, TD] = DEMO_TODAY.split('-').map(Number)
const NOW = new Date(TY, TM - 1, TD)

const blink = keyframes`50% { opacity: 0; }`
const rise = keyframes`from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; }`

// Something landing in the mock: a short rise on mount, none without motion.
const landing = (reduce) => (reduce ? {} : { animation: `${rise} 0.3s ease-out` })

// The frame to show now: the loop plays while in view with the tab showing,
// and rests on the filled-in form under reduced motion.
function useLoop(playback, frames) {
  const holds = useMemo(() => frames.map((f) => f.ms), [frames])
  const phase = usePhases(playback, holds)
  return frames[playback.reduce ? restFrameIndex(frames) : Math.min(phase, frames.length - 1)]
}

// The "Type it" box: the line as typed so far with a caret while typing, and
// the Fill button (a ring while it works).
function TypeItBox({ text, typing, working, reduce }) {
  const t = useT('ai')
  return (
    <Box>
      <HStack spacing={1.5} mb={2} fontSize="sm" fontWeight="600">
        <Box as="span" color="accent.fg" display="inline-flex"><Sparkle size={14} fill="currentColor" /></Box>
        <Text as="span">{t('add.label')}</Text>
      </HStack>
      <HStack h="42px" pl={3} pr={1} spacing={2} bg="bg.surface" borderRadius="lg" borderWidth="1px"
        borderColor={typing ? 'brand.300' : 'border.default'}>
        <Flex flex="1" minW={0} align="center" fontSize="sm" whiteSpace="nowrap" overflow="hidden">
          <Text as="span">{text}</Text>
          {typing && !reduce && (
            <Box as="span" w="2px" h="18px" ml="1px" bg="accent.fg" flexShrink={0}
              animation={`${blink} 1s step-end infinite`} />
          )}
        </Flex>
        <Center w="32px" h="32px" borderRadius="md" flexShrink={0} transition="background 0.2s"
          bg={text ? 'brand.500' : 'bg.subtle'} color={text ? 'white' : 'text.muted'}>
          {working ? <RingSpinner /> : <ArrowRight size={16} />}
        </Center>
      </HStack>
    </Box>
  )
}

// Under the box: "Filling in the form…" while it works, then "Filled in".
function TypeItStatus({ stage }) {
  const t = useT('ai')
  return (
    <Flex h="20px" mt={2} align="center" fontSize="xs" color="text.muted">
      {stage === 'filling' && (
        <HStack spacing={2}><RingMark size={16} /><Text>{t('add.working')}</Text></HStack>
      )}
      {stage === 'filled' && <Text>{t('add.done')}</Text>}
    </Flex>
  )
}

// One field of the Add form: its label, and once filled its value with the
// Suggested mark. An empty field shows a faint bar.
function FieldRow({ label, filled, reduce, children }) {
  return (
    <Flex h="48px" align="center" gap={3} borderTopWidth="1px" borderColor="border.default" _first={{ borderTopWidth: 0 }}>
      <Box flex="1" minW={0}>
        <Text fontSize="xs" color="text.muted" lineHeight="1.3">{label}</Text>
        <Flex h="22px" align="center" minW={0}>
          {filled
            ? <Box minW={0} {...landing(reduce)}>{children}</Box>
            : <Box w="40%" h="8px" borderRadius="full" bg="bg.subtle" />}
        </Flex>
      </Box>
      {filled && <SuggestedMark {...landing(reduce)} />}
    </Flex>
  )
}

// A phone on Add where a line types itself into "Type it", the
// form fills in field by field with the Suggested marks, and after a pause
// the next line (an income) does the same, then it loops.
export default function TypeItMock() {
  const t = useT('landing')
  const tt = useT('transactions')
  const playback = usePlayback()
  const lines = TYPE_IT_EXAMPLES.map((ex) => t(`demo.ai.lines.${ex.id}`))
  const linesKey = lines.join('\n')
  const frames = useMemo(() => typeItFrames(linesKey.split('\n').map((l) => l.length)), [linesKey])
  const frame = useLoop(playback, frames)
  const ex = TYPE_IT_EXAMPLES[frame.example]
  const kind = frame.stage === 'filled' ? ex.kind : 'expense'
  const filled = new Set(frame.stage === 'filled' ? fieldsFor(ex).slice(0, frame.filled) : [])

  const value = {
    amount: <Text fontFamily="heading" fontWeight="700">{money(ex.amountMinor)}</Text>,
    category: (
      <HStack spacing={2} minW={0}>
        <CategoryBadge category={ex.categoryName} kind={ex.kind} size={22} />
        <Text fontWeight="600" fontSize="sm" noOfLines={1}>{t(`demo.categories.${ex.category}`)}</Text>
      </HStack>
    ),
    date: <Text fontWeight="600" fontSize="sm">{shortDate(ex.date, NOW)}</Text>,
    description: <Text fontWeight="600" fontSize="sm" noOfLines={1}>{t(`demo.ai.descriptions.${ex.id}`)}</Text>,
    paidFrom: ex.paidFrom && <Text fontWeight="600" fontSize="sm">{t(`common:paidFrom.${ex.paidFrom}`)}</Text>,
  }
  const labels = {
    amount: tt('form.amount'), category: tt('form.category'), date: tt('form.date'),
    description: tt('form.description'), paidFrom: t('common:paidFrom.label'),
  }

  return (
    <PhoneFrame ref={playback.ref} label={t('demo.ai.label')}>
      <HStack px={4} pt={3} pb={3} justify="space-between">
        <Text fontFamily="heading" fontWeight="700">{tt(`form.submit.${kind}`)}</Text>
        <HStack spacing={0.5} p={0.5} borderRadius="md" bg="bg.subtle" fontSize="xs" fontWeight="600">
          {['expense', 'income'].map((k) => (
            <Box key={k} px={2} py={0.5} borderRadius="sm" transition="background 0.2s"
              bg={k === kind ? 'bg.surface' : 'transparent'} color={k === kind ? 'text.primary' : 'text.muted'}>
              {tt(`kinds.${k}`)}
            </Box>
          ))}
        </HStack>
      </HStack>
      <Panel {...SCREEN_CARD} p={3.5}>
        <TypeItBox text={lines[frame.example].slice(0, frame.typed)} typing={frame.stage === 'typing'}
          working={frame.stage === 'filling'} reduce={playback.reduce} />
        <TypeItStatus stage={frame.stage} />
      </Panel>
      <Panel {...SCREEN_CARD} p={0} px={3.5} py={1} h={`${FORM_FIELDS.length * 48 + 8}px`}>
        {FORM_FIELDS.filter((f) => f !== 'paidFrom' || ex.kind === 'expense').map((f) => (
          <FieldRow key={`${ex.id}-${f}`} label={labels[f]} filled={filled.has(f)} reduce={playback.reduce}>
            {value[f]}
          </FieldRow>
        ))}
      </Panel>
    </PhoneFrame>
  )
}
