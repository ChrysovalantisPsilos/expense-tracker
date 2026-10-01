// Plan mode's building blocks: the impact card, a plan row, the ideas strip,
// "Your changes" (with Apply and Clear plan), the hint, and the ids that tie
// an editor to its opener. The editors that open in place under a row, a
// change or the ideas are in PlanEditors.jsx. Every figure and word is
// planPage.js's (its parts); these only lay them out.
import { Link as RouterLink } from 'react-router-dom'
import { addEntryLink } from '../../shared/lib/addLinks.js'
import {
  Box, Button, Flex, HStack, IconButton, Stack, Switch, Tag, Text,
} from '@chakra-ui/react'
import { Check, ExternalLink, Info, PiggyBank, Plus, RotateCcw, X } from 'lucide-react'
import CategoryBadge from '../../shared/ui/CategoryBadge.jsx'
import SegmentedControl from '../../shared/ui/SegmentedControl.jsx'
import SumSteps from '../../shared/ui/SumSteps.jsx'
import { InfoBox, InfoButton, useInfoToggle } from '../../shared/ui/InfoToggle.jsx'
import Panel from '../../shared/ui/kit/Panel.jsx'
import SectionLabel from '../../shared/ui/kit/SectionLabel.jsx'
import { signTone, textColor } from '../../shared/ui/kit/kitMath.js'
import { Rich, useT } from '../../shared/lib/i18n/I18nProvider.jsx'
import { badgeKind } from './planPage.js'

// The ids that tie an inline editor (PlanEditors) to what opens it. `key`
// names the opener: a row's id, 'changes-<id>' for its entry in "Your
// changes", 'new' for "What if I add…", an idea's id for its picker. The
// opener's id gets focus back on close; the editor's is for aria-controls.
export const changeKey = (id) => `changes-${id}`
// What an opened editor scrolls into view (the item, with its opener) keeps
// clear of the header and the tab bar.
export const SCROLL_CLEAR = { scrollMarginTop: '80px', scrollMarginBottom: '96px' }
export const openerId = (key) => `plan-open-${key}`
export const editorId = (key) => `plan-editor-${key}`

// A quiet line: this change stays in the plan (a derived row).
export function PlanOnlyNote({ text }) {
  return (
    <HStack role="note" spacing={2} align="start" color="text.muted">
      <Box mt="2px" flexShrink={0}><Info size={14} /></Box>
      <Text fontSize="xs">{text}</Text>
    </HStack>
  )
}

// ---- Top of the page -------------------------------------------------------------

function ViewSwitch({ view, onChange }) {
  const t = useT('plan')
  return (
    <SegmentedControl label={t('view.label')} size="sm" value={view} onChange={onChange}
      options={[['month', t('view.month')], ['year', t('view.year')]]} />
  )
}

// Under the title: the plan is kept by itself, and nothing real changes yet.
export function SavedNote({ status, onRetry }) {
  const t = useT('plan')
  if (status === 'error') {
    return (
      <HStack spacing={2} fontSize="xs" color="status.negative" flexWrap="wrap">
        <Text>{t('saved.error')}</Text>
        <Button variant="link" size="xs" color="accent.fg" onClick={onRetry}>{t('saved.retry')}</Button>
      </HStack>
    )
  }
  return (
    <HStack spacing={1.5} fontSize="xs" color="text.muted" align="start">
      <Box color="status.positive" mt="2px" flexShrink={0}><Check size={14} strokeWidth={3} /></Box>
      <Text>{t(status === 'saving' ? 'saved.saving' : 'saved.saved')}</Text>
    </HStack>
  )
}

// The move in the header's figure: "+€15.00" for the net; for the payments,
// "€385.09 less" (green) or "€20.00 more" (red). `good` > 0 is green.
function DeltaChip({ delta }) {
  const { text, good } = delta
  return (
    <Tag size="md" borderRadius="full" px={3} py={1} fontWeight="800" flexShrink={0} whiteSpace="nowrap"
      bg={good > 0 ? 'status.positiveSubtle' : good < 0 ? 'status.negativeSubtle' : 'bg.subtle'}
      color={textColor(signTone(good))} fontSize="sm">
      {text}
    </Tag>
  )
}

// The figure after the plan in the chosen unit (what's left over, or with no
// recurring income the recurring payments), "was" struck through when it
// moved, the move in that same unit (only that one: the Month/Year switch
// gives the other), and what goes into savings. How the figure adds up
// (SumSteps) sits behind the ⓘ beside its label and opens in place; a rate
// that's missing stays in view, since it changes the figure (payments: a
// nudge to add the salary as recurring income). `parts`: planPage.impactParts.
export function ImpactHeader({ parts, view, onView }) {
  const tc = useT()
  const info = useInfoToggle()
  return (
    <Panel p={4}>
      <Flex justify="space-between" align="center" gap={2} flexWrap="wrap" mt={-1}>
        <HStack spacing={0.5}>
          <Text fontSize="xs" color="text.muted" fontWeight="600">{parts.label}</Text>
          {parts.hasInfo && (
            <InfoButton info={info} label={tc('info')} />
          )}
        </HStack>
        <ViewSwitch view={view} onChange={onView} />
      </Flex>
      <Flex align="center" gap={2} mt={1} flexWrap="wrap">
        <Text fontFamily="heading" fontWeight="700" fontSize="2xl" lineHeight="1.15" whiteSpace="nowrap" flex="1">
          {parts.figure}
        </Text>
        <DeltaChip delta={parts.delta} />
      </Flex>
      {parts.was && (
        <Text color="text.muted" mt={0.5} fontSize="sm">
          <Rich text={parts.was} components={{ s: <Text as="s" /> }} />
        </Text>
      )}
      {parts.saved && (
        <HStack spacing={1.5} mt={1} fontSize="sm" color="text.muted">
          <Box color="accent.fg" flexShrink={0}><PiggyBank size={16} /></Box>
          <Text>{parts.saved}</Text>
        </HStack>
      )}
      {parts.hasInfo && (
        <InfoBox info={info}>
          {parts.steps && <SumSteps title={parts.steps.title} steps={parts.steps.steps} total={parts.steps.total} />}
          {parts.converted && <RatesLine text={parts.converted} mt={parts.steps ? 2 : 0} />}
        </InfoBox>
      )}
      {parts.incomeHint && <IncomeHint />}
      {parts.missing && <RatesLine text={parts.missing} mt={1} />}
    </Panel>
  )
}

// A rates note under a figure built from rules (as recurring's RatesNote
// lays one out): foreign ones converted at today's rate, or left out.
function RatesLine({ text, ...props }) {
  return <Box fontSize="xs" color="text.muted" {...props}><Text>{text}</Text></Box>
}

// No recurring income: the net would only be minus the payments, so the card
// shows the payments and asks for the salary as recurring income (the real
// form, preset to income).
function IncomeHint() {
  const t = useT('plan')
  return (
    <Box mt={3} bg="bg.subtle" borderRadius="lg" px={3} py={2.5}>
      <HStack align="start" spacing={2}>
        <Box color="accent.fg" mt="2px" flexShrink={0}><Info size={16} /></Box>
        <Text fontSize="sm">{t('impact.addIncome')}</Text>
      </HStack>
      <Button as={RouterLink} to={addEntryLink({ kind: 'income', repeat: true })} size="sm" variant="outline" mt={2} ml={6}
        maxW="calc(100% - 24px)" h="auto" minH="36px" py={1.5} whiteSpace="normal" textAlign="left"
        leftIcon={<Plus size={16} />}>
        {t('impact.addIncomeButton')}
      </Button>
    </Box>
  )
}

// ---- Rows --------------------------------------------------------------------------

const TAG_TONES = { priceUp: 'orange', overlap: 'purple', overBudget: 'red', biggest: 'orange' }
const STATE_TONES = { positive: 'green', negative: 'red', accent: 'brand' }

// A signal's tag ({ kind, text }: planPage's).
export function SignalTag({ tag, ...props }) {
  return (
    <Tag size="sm" variant="outline" colorScheme={TAG_TONES[tag.kind]} borderRadius="full" px={2} flexShrink={0} {...props}>
      {tag.text}
    </Tag>
  )
}

// One row (planPage.rowParts): tap it to open its editor in place
// (`editor`, while `open`); the switch keeps it (on) or cancels it in the
// plan (off). A changed row shows its old amount struck through.
const AMOUNT_COLOR = { muted: 'text.muted', positive: 'status.positive', default: undefined }
export function PlanRow({ row, open, editor, onOpen, onToggle }) {
  const { item } = row
  return (
    <Box as="li" listStyleType="none" data-plan-item="" sx={SCROLL_CLEAR}>
      <HStack spacing={1} minH="56px">
        <HStack as="button" type="button" id={openerId(row.id)} onClick={onOpen} spacing={3} flex="1" minW={0} py={2} px={1}
          mx={-1} textAlign="left" borderRadius="lg" _hover={{ bg: 'bg.subtle' }} aria-label={row.openLabel}
          aria-expanded={!!open} aria-controls={open ? editorId(row.id) : undefined}>
          <Box opacity={row.cancelled ? 0.5 : 1} flexShrink={0}>
            <CategoryBadge category={item.category} kind={badgeKind(item.kind)} size={32} />
          </Box>
          <Box flex="1" minW={0}>
            <Flex columnGap={1.5} rowGap={0.5} minW={0} flexWrap="wrap" align="center">
              <Text fontSize="sm" fontWeight="600" noOfLines={1} color={row.cancelled ? 'text.muted' : undefined}>{row.name}</Text>
              {row.state && (
                <Tag size="sm" colorScheme={STATE_TONES[row.state.tone]} borderRadius="full" px={2} flexShrink={0}>{row.state.text}</Tag>
              )}
            </Flex>
            <Text fontSize="xs" color="text.muted" noOfLines={2}>{row.meta}</Text>
            {row.tag && <SignalTag tag={row.tag} mt={1} />}
          </Box>
          <Stack spacing={0} align="flex-end" flexShrink={0}>
            <Text fontSize="sm" fontWeight="700" color={AMOUNT_COLOR[row.amount.tone]} as={row.amount.struck ? 's' : undefined}>
              {row.amount.text}
            </Text>
            {row.was && (
              <Text fontSize="xs" color="text.muted" as="s">{row.was}</Text>
            )}
          </Stack>
        </HStack>
        <Flex as="label" w="52px" minH="48px" align="center" justify="center" flexShrink={0} cursor="pointer">
          <Switch isChecked={!row.cancelled} onChange={onToggle} aria-label={row.toggleLabel} />
        </Flex>
      </HStack>
      {row.stale && <UpdatedNote text={row.stale} />}
      {open && editor}
    </Box>
  )
}

// Under a row whose real payment changed since it was planned.
function UpdatedNote({ text }) {
  return (
    <HStack align="start" spacing={2} bg="status.warningSubtle" borderRadius="lg" px={3} py={2} ml="44px" mb={2}>
      <Box color="status.warning" mt="1px" flexShrink={0}><RotateCcw size={14} /></Box>
      <Text fontSize="xs">
        <Rich text={text} components={{ strong: <Text as="span" fontWeight="700" /> }} />
      </Text>
    </HStack>
  )
}

// "What if I add…" — a hypothetical payment or income, only in the plan. It
// opens into its form (`form`, while `open`) right below.
export function WhatIfRow({ open, form, onClick }) {
  const t = useT('plan')
  return (
    <Box data-plan-item="" sx={SCROLL_CLEAR}>
      <HStack as="button" type="button" id={openerId('new')} onClick={onClick} w="full" spacing={3} px={3} py={2.5}
        minH="56px" borderRadius="xl" borderWidth="1.5px" borderStyle="dashed" borderColor="border.default" textAlign="left"
        bg="bg.surface" _hover={{ bg: 'bg.subtle' }} aria-expanded={!!open} aria-controls={open ? editorId('new') : undefined}>
        <Box color="accent.fg" flexShrink={0}><Plus size={20} /></Box>
        <Box minW={0}>
          <Text fontSize="sm" fontWeight="700" color="accent.fg">{t('whatIf.title')}</Text>
          <Text fontSize="xs" color="text.muted">{t('whatIf.text')}</Text>
        </Box>
      </HStack>
      {open && form}
    </Box>
  )
}

// ---- Ideas ---------------------------------------------------------------------

// The "Ideas to save" strip (planPage.ideasParts): each idea tried in one tap
// or dismissed with ×. An overlap's "Try it" opens its picker (`picking`:
// that idea's id) and a price rise on an essential opens the payment, to try
// a lower price; neither cancels anything by itself.
export function IdeasStrip({ ideas, picking, onTry, onDismiss }) {
  const t = useT('plan')
  if (!ideas.cards.length) return null
  return (
    <Box as="section" aria-label={t('ideas.title')}>
      <SectionLabel mb={2} px={1} aside={<Text as="span" fontSize="xs" color="text.muted" fontWeight="600">{ideas.count}</Text>}>
        {t('ideas.title')}
      </SectionLabel>
      {/* Keyed by the ideas, so a new set starts from the first card (the
          browser would otherwise stay snapped to the card it was on). */}
      <HStack key={ideas.cards.map((i) => i.id).join()} spacing={3} overflowX="auto" mx={-4} px={4} pb={3} align="stretch"
        sx={{ scrollSnapType: 'x mandatory', scrollPaddingInline: '16px', scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}>
        {ideas.cards.map((card) => (
          <Panel key={card.id} elevation="soft" p={4} w={{ base: '272px', md: '288px' }} flexShrink={0}
            display="flex" flexDir="column" sx={{ scrollSnapAlign: 'start' }}>
            <HStack justify="space-between" align="start" mb={1}>
              <SignalTag tag={card.tag} />
              <IconButton aria-label={card.dismissLabel} icon={<X size={16} />} size="sm"
                variant="ghost" mt={-1.5} mr={-2} onClick={() => onDismiss(card.idea)} />
            </HStack>
            <Text fontFamily="heading" fontWeight="700" fontSize="md" lineHeight="1.25">{card.title}</Text>
            <Text fontSize="xs" color="text.muted" mt={1} flex="1">{card.body}</Text>
            <Flex mt={3} justify="space-between" align="center" columnGap={2} rowGap={2} flexWrap="wrap">
              <Text fontSize="sm" fontWeight="700" color={textColor(card.figure.tone)} whiteSpace="nowrap">
                {card.figure.text}
              </Text>
              <Button size="sm" flexShrink={0} ml="auto" id={openerId(card.id)} onClick={() => onTry(card.idea)}
                {...(card.action === 'pick' && {
                  'aria-expanded': picking === card.id, 'aria-controls': picking === card.id ? editorId(card.id) : undefined,
                })}>
                {card.tryLabel}
              </Button>
            </Flex>
          </Panel>
        ))}
      </HStack>
    </Box>
  )
}

// ---- Your changes -----------------------------------------------

// "Your changes" (planPage.changesParts): each with what it does to the
// figure the header shows (the net, or the payments), the total, then Apply
// (when anything can be applied: the salary change is only in the plan) and
// Clear plan. Tap a change to edit it in place (`editor(item)` while
// `isOpen(item)`: the same editor as its row); "Undo this change" (or
// "Remove", for an added one) drops just it.
export function ChangesPanel({ parts, isOpen, editor, onOpen, onDrop, onApply, onClear }) {
  const t = useT('plan')
  return (
    <Panel p={4} as="section" aria-label={parts.title}>
      <Box mb={1}>
        <SectionLabel>{parts.title}</SectionLabel>
      </Box>
      <Box as="ul" listStyleType="none">
        {parts.rows.map((row) => {
          const it = row.item
          const open = isOpen(it)
          const key = changeKey(row.id)
          return (
            <Box as="li" key={row.id} data-plan-item="" sx={SCROLL_CLEAR} py={1.5} borderBottomWidth="1px" borderColor="border.default">
              <HStack as="button" type="button" id={openerId(key)} onClick={() => onOpen(it)} w="full" spacing={3} py={1.5}
                px={1} mx={-1} align="start" textAlign="left" borderRadius="lg" _hover={{ bg: 'bg.subtle' }}
                aria-label={row.editLabel} aria-expanded={open} aria-controls={open ? editorId(key) : undefined}>
                <Box pt={0.5}><CategoryBadge category={it.category} kind={badgeKind(it.kind)} size={32} /></Box>
                <Box flex="1" minW={0}>
                  <Text fontSize="sm" fontWeight="600" noOfLines={1}>{row.name}</Text>
                  <Text fontSize="xs" color="text.muted">{row.line}</Text>
                  {row.note && (
                    <Text fontSize="xs" color="text.muted" mt={1}>{row.note}</Text>
                  )}
                </Box>
                <Box textAlign="right" flexShrink={0}>
                  <Text fontSize="sm" fontWeight="700" color={textColor(row.perMonth.tone)}>{row.perMonth.text}</Text>
                  <Text fontSize="xs" color="text.muted">{row.perYear}</Text>
                </Box>
              </HStack>
              <Flex columnGap={4} rowGap={0} pl="44px" pb={1} flexWrap="wrap" align="center">
                <Button variant="link" size="sm" minH="44px" color="accent.fg" leftIcon={row.remove ? <X size={14} /> : <RotateCcw size={14} />}
                  aria-label={row.dropLabel} onClick={() => onDrop(it)}>
                  {row.drop}
                </Button>
                {row.rule && (
                  <Button as={RouterLink} to={`/recurring/${row.rule}`} variant="link" size="sm" minH="44px" color="text.muted"
                    rightIcon={<ExternalLink size={12} />}>{t('changes.open')}</Button>
                )}
              </Flex>
              {open && editor(it)}
            </Box>
          )
        })}
      </Box>
      <HStack pt={3} justify="space-between" align="baseline">
        <Text fontSize="sm" fontWeight="700">{parts.total.label}</Text>
        <Box textAlign="right">
          <Text fontFamily="heading" fontWeight="700" fontSize="lg" color={textColor(parts.total.tone)}>
            {parts.total.perMonth}
          </Text>
          <Text fontSize="xs" color="text.muted" fontWeight="600">{parts.total.perYear}</Text>
        </Box>
      </HStack>
      <Stack direction={{ base: 'column', sm: 'row' }} spacing={2} pt={4}>
        {parts.canApply && (
          <Button flex="1" minH="48px" h="auto" py={2} whiteSpace="normal" onClick={onApply}>{t('changes.apply')}</Button>
        )}
        <Button flex={parts.canApply ? { sm: '0 0 auto' } : '1'} minH="48px" variant="outline" leftIcon={<RotateCcw size={16} />} onClick={onClear}>
          {t('changes.clear')}
        </Button>
      </Stack>
    </Panel>
  )
}

// Before any change: a quiet hint where "Your changes" will appear.
export function PlanHint() {
  const t = useT('plan')
  return (
    <HStack spacing={2} justify="center" py={3} color="text.muted">
      <Info size={16} />
      <Text fontSize="sm">{t('hint')}</Text>
    </HStack>
  )
}
