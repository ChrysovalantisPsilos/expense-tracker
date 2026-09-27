// Plan mode's building blocks: the impact card, a plan row, the ideas strip,
// "Your changes", the sticky apply bar, and the money/frequency wording they
// share. The maths behind every figure is planMath.js.
import { Link as RouterLink } from 'react-router-dom'
import {
  Box, Button, Flex, HStack, IconButton, Stack, Switch, Tag, Text,
} from '@chakra-ui/react'
import { Check, ExternalLink, Info, Plus, RotateCcw, X } from 'lucide-react'
import CategoryBadge from '../../shared/ui/CategoryBadge.jsx'
import SegmentedControl from '../../shared/ui/SegmentedControl.jsx'
import Panel from '../../shared/ui/kit/Panel.jsx'
import SectionLabel from '../../shared/ui/kit/SectionLabel.jsx'
import { formatMoney } from '../../shared/lib/currency.js'
import { categoryDisplayName } from '../../shared/lib/categoryName.js'
import { shortDate, shortMonth } from '../../shared/lib/dates.js'
import { intlLocale, t as tr } from '../../shared/lib/i18n/i18n.js'
import { Trans, useT } from '../../shared/lib/i18n/I18nProvider.jsx'
import { frequencyLabel, ruleToChoice } from '../recurring/recurringMath.js'
import { RatesNote } from '../recurring/SubscriptionGroups.jsx'
import { effectOf, inView, monthOf } from './planMath.js'

// ---- Wording ---------------------------------------------------------------------

// +€15.00 / −€15.00 / €0.00
export const signed = (minor, currency) =>
  (minor > 0 ? `+${formatMoney(minor, currency)}` : minor < 0 ? `−${formatMoney(-minor, currency)}` : formatMoney(0, currency))

export const toneOf = (minor) => (minor > 0 ? 'status.positive' : minor < 0 ? 'status.negative' : 'text.muted')

// "Monthly", "Quarterly", or "every 2 weeks" for an interval.
export function freqLabel(fields) {
  const { choice, n } = ruleToChoice(fields)
  return n > 1 ? frequencyLabel(fields) : tr(`recurring:choices.${choice}`)
}

// "€13.99 a month", "€480.00 a year", "€10.00 every 2 weeks" — a charge in
// its own currency, per the period it repeats.
export function perUnit(fields) {
  const amount = formatMoney(fields.amount_minor, fields.currency)
  const { choice, n } = ruleToChoice(fields)
  return n > 1 ? tr('plan:units.custom', { amount, frequency: frequencyLabel(fields) }) : tr(`plan:units.${choice}`, { amount })
}

// A row's display name: its own, else its category's, else its kind.
export const itemName = (item) => item.name || tr(`recurring:kinds.${item.kind === 'income' ? 'income' : 'expense'}`)

// "Jul, Aug and Sep" from 'YYYY-MM-01' keys.
export function monthList(months) {
  const names = months.map((m) => shortMonth(Number(m.slice(5, 7)) - 1))
  return new Intl.ListFormat(intlLocale('en-GB'), { type: 'conjunction' }).format(names)
}

// ---- Top of the page -------------------------------------------------------------

export function ViewSwitch({ view, onChange }) {
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

export function DeltaChip({ delta, currency }) {
  const t = useT('plan')
  return (
    <Tag size="md" borderRadius="full" px={3} py={1} fontWeight="800" flexShrink={0} whiteSpace="nowrap"
      bg={delta > 0 ? 'status.positiveSubtle' : delta < 0 ? 'status.negativeSubtle' : 'bg.subtle'}
      color={toneOf(delta)} fontSize="sm">
      {delta === 0 ? t('impact.noChanges') : signed(delta, currency)}
    </Tag>
  )
}

// Net after the plan in the chosen unit, "was" struck through when it moved,
// the delta, the other unit's figure, and the one-line rule.
export function ImpactHeader({ sum, view, onView, currency, rates }) {
  const t = useT('plan')
  const after = inView(sum.after, view)
  const delta = inView(sum.delta, view)
  const other = view === 'year'
    ? t('impact.aboutPerMonth', { amount: signed(monthOf(sum.delta), currency) })
    : t('impact.perYear', { amount: signed(sum.delta, currency) })
  return (
    <Panel p={4}>
      <Flex justify="space-between" align="center" gap={2} flexWrap="wrap" mt={-1}>
        <Text fontSize="xs" color="text.muted" fontWeight="600">{t(`impact.net.${view}`)}</Text>
        <ViewSwitch view={view} onChange={onView} />
      </Flex>
      <Flex align="center" gap={2} mt={1} flexWrap="wrap">
        <Text fontFamily="heading" fontWeight="700" fontSize="2xl" lineHeight="1.15" whiteSpace="nowrap" flex="1">
          {formatMoney(after, currency)}
        </Text>
        <DeltaChip delta={delta} currency={currency} />
      </Flex>
      {sum.delta !== 0 && (
        <HStack spacing={1.5} mt={0.5} fontSize="sm" flexWrap="wrap">
          <Text color="text.muted">
            <Trans t={t} k="impact.was" values={{ amount: formatMoney(inView(sum.before, view), currency) }}
              components={{ s: <Text as="s" /> }} />
          </Text>
          <Text color="text.muted" aria-hidden>·</Text>
          <Text fontWeight="700" color={toneOf(sum.delta)}>{other}</Text>
        </HStack>
      )}
      <Text fontSize="xs" color="text.muted" mt={1}>{t('impact.rule')}</Text>
      <RatesNote converted={rates.converted} missing={rates.missing} mt={1} />
    </Panel>
  )
}

// ---- Rows --------------------------------------------------------------------------

const TAG_TONES = { priceUp: 'orange', overlap: 'purple', overBudget: 'red', biggest: 'orange' }

function StateTag({ item }) {
  const t = useT('plan')
  if (!item.changed) return null
  const [key, scheme] = item.added ? ['new', 'green']
    : item.cancelled ? [item.kind === 'income' ? 'stopped' : 'cancelled', 'red'] : ['changed', 'brand']
  return <Tag size="sm" colorScheme={scheme} borderRadius="full" px={2} flexShrink={0}>{t(`tags.${key}`)}</Tag>
}

export function SignalTag({ tag, ...props }) {
  const t = useT('plan')
  return (
    <Tag size="sm" variant="outline" colorScheme={TAG_TONES[tag.kind]} borderRadius="full" px={2} flexShrink={0} {...props}>
      {t(`tags.${tag.kind}`, { pct: tag.pct })}
    </Tag>
  )
}

// The muted line under a row's name.
function rowMeta(item, view, t) {
  const f = item.after ?? item.before
  if (item.added) return t('row.from', { frequency: freqLabel(f), date: shortDate(item.next) })
  const b = item.before
  if (view === 'month' && b.frequency === 'yearly' && Number(b.interval_n) === 1 && !item.changed) {
    return t('row.yearShare', { amount: formatMoney(b.amount_minor, b.currency) })
  }
  return t('row.next', { frequency: freqLabel(f), date: shortDate(item.next) })
}

// One row: tap it to edit it in the plan; the switch keeps it (on) or cancels
// it in the plan (off). A changed row shows its old amount struck through.
export function PlanRow({ item, view, currency, tag, onOpen, onToggle }) {
  const t = useT('plan')
  const name = itemName(item)
  const now = inView(item.afterYear, view)
  const was = inView(item.beforeYear, view)
  const own = (fields) => formatMoney(fields.amount_minor, fields.currency)
  return (
    <Box as="li" listStyleType="none">
      <HStack spacing={1} minH="56px">
        <HStack as="button" type="button" onClick={onOpen} spacing={3} flex="1" minW={0} py={2} px={1} mx={-1}
          textAlign="left" borderRadius="lg" _hover={{ bg: 'bg.subtle' }} aria-label={t('row.open', { name })}>
          <Box opacity={item.cancelled ? 0.5 : 1} flexShrink={0}>
            <CategoryBadge category={item.category} kind={item.kind} size={32} />
          </Box>
          <Box flex="1" minW={0}>
            <HStack spacing={1.5} minW={0}>
              <Text fontSize="sm" fontWeight="600" noOfLines={1} color={item.cancelled ? 'text.muted' : undefined}>{name}</Text>
              <StateTag item={item} />
            </HStack>
            <Text fontSize="xs" color="text.muted" noOfLines={1}>{rowMeta(item, view, t)}</Text>
            {tag && <SignalTag tag={tag} mt={1} />}
          </Box>
          <Stack spacing={0} align="flex-end" flexShrink={0}>
            {item.missing ? (
              <Text fontSize="sm" fontWeight="700" color="text.muted">{own(item.after ?? item.before)}</Text>
            ) : item.cancelled ? (
              <Text fontSize="sm" fontWeight="700" color="text.muted" as="s">{formatMoney(was, currency)}</Text>
            ) : (
              <Text fontSize="sm" fontWeight="700" color={item.kind === 'income' ? 'status.positive' : undefined}>
                {formatMoney(now, currency)}
              </Text>
            )}
            {item.changed && !item.cancelled && !item.added && !item.missing && (
              <Text fontSize="xs" color="text.muted" as="s">{formatMoney(was, currency)}</Text>
            )}
          </Stack>
        </HStack>
        <Flex as="label" w="52px" minH="48px" align="center" justify="center" flexShrink={0} cursor="pointer">
          <Switch isChecked={!item.cancelled} onChange={onToggle}
            aria-label={t(item.cancelled ? 'row.keep' : 'row.cancel', { name })} />
        </Flex>
      </HStack>
      {item.stale && <UpdatedNote item={item} />}
    </Box>
  )
}

// Under a row whose real payment changed since it was planned.
function UpdatedNote({ item }) {
  const t = useT('plan')
  const values = {
    now: perUnit(item.before), was: perUnit(item.snap),
    plan: item.after ? perUnit(item.after) : '',
  }
  return (
    <HStack align="start" spacing={2} bg="status.warningSubtle" borderRadius="lg" px={3} py={2} ml="44px" mb={2}>
      <Box color="status.warning" mt="1px" flexShrink={0}><RotateCcw size={14} /></Box>
      <Text fontSize="xs">
        <Trans t={t} k={item.cancelled ? 'row.updatedCancel' : 'row.updatedEdit'} values={values}
          components={{ strong: <Text as="span" fontWeight="700" /> }} />
      </Text>
    </HStack>
  )
}

// "What if I add…" — a hypothetical payment or income, only in the plan.
export function WhatIfRow({ onClick }) {
  const t = useT('plan')
  return (
    <HStack as="button" type="button" onClick={onClick} w="full" spacing={3} px={3} py={2.5} minH="56px" borderRadius="xl"
      borderWidth="1.5px" borderStyle="dashed" borderColor="border.default" textAlign="left"
      bg="bg.surface" _hover={{ bg: 'bg.subtle' }}>
      <Box color="accent.fg" flexShrink={0}><Plus size={20} /></Box>
      <Box minW={0}>
        <Text fontSize="sm" fontWeight="700" color="accent.fg">{t('whatIf.title')}</Text>
        <Text fontSize="xs" color="text.muted">{t('whatIf.text')}</Text>
      </Box>
    </HStack>
  )
}

// ---- Ideas ---------------------------------------------------------------------

// An idea's headline and short line, in the app's language.
export function ideaText(idea, currency, t) {
  const year = formatMoney(idea.year, currency)
  switch (idea.kind) {
    case 'overlap': {
      const names = new Intl.ListFormat(intlLocale('en-GB'), { type: 'conjunction' }).format(idea.names.map((n) => n || '…'))
      const category = categoryDisplayName(idea.category)
      return {
        name: t('ideas.overlap.name', { count: idea.ruleIds.length, category }),
        title: t('ideas.overlap.title', { count: idea.ruleIds.length, category, amount: year }),
        body: t('ideas.overlap.body', { names }),
      }
    }
    case 'priceUp':
      return {
        title: t('ideas.priceUp.title', { name: idea.name, pct: idea.rise.pct, amount: year }),
        body: t('ideas.priceUp.body', {
          from: formatMoney(idea.rise.from, idea.rise.currency), to: formatMoney(idea.rise.to, idea.rise.currency),
          date: shortDate(idea.rise.since),
        }),
      }
    case 'overBudget':
      return {
        title: t('ideas.overBudget.title', { name: idea.name, amount: year }),
        body: t('ideas.overBudget.body', { category: categoryDisplayName(idea.category), months: monthList(idea.months) }),
      }
    default:
      return { title: t('ideas.biggest.title', { name: idea.name, amount: year }), body: t('ideas.biggest.body') }
  }
}

// The "Ideas to save" strip: each idea tried in one tap (overlap: pick which)
// or dismissed with ×.
export function IdeasStrip({ ideas, view, currency, onTry, onDismiss }) {
  const t = useT('plan')
  if (!ideas.length) return null
  return (
    <Box as="section" aria-label={t('ideas.title')}>
      <SectionLabel mb={2} px={1} aside={<Text as="span" fontSize="xs" color="text.muted" fontWeight="600">{t('ideas.count', { count: ideas.length })}</Text>}>
        {t('ideas.title')}
      </SectionLabel>
      {/* Keyed by the ideas, so a new set starts from the first card (the
          browser would otherwise stay snapped to the card it was on). */}
      <HStack key={ideas.map((i) => i.id).join()} spacing={3} overflowX="auto" mx={-4} px={4} pb={3} align="stretch"
        sx={{ scrollSnapType: 'x mandatory', scrollPaddingInline: '16px', scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}>
        {ideas.map((idea) => {
          const text = ideaText(idea, currency, t)
          return (
            <Panel key={idea.id} elevation="soft" p={4} w={{ base: '272px', md: '288px' }} flexShrink={0}
              display="flex" flexDir="column" sx={{ scrollSnapAlign: 'start' }}>
              <HStack justify="space-between" align="start" mb={1}>
                <SignalTag tag={{ kind: idea.kind, pct: idea.rise?.pct }} />
                <IconButton aria-label={t('ideas.dismiss', { title: text.title })} icon={<X size={16} />} size="sm"
                  variant="ghost" mt={-1.5} mr={-2} onClick={() => onDismiss(idea)} />
              </HStack>
              <Text fontFamily="heading" fontWeight="700" fontSize="md" lineHeight="1.25">{text.title}</Text>
              <Text fontSize="xs" color="text.muted" mt={1} flex="1">{text.body}</Text>
              <HStack mt={3} justify="space-between" spacing={2}>
                <Text fontSize="sm" fontWeight="700" color="status.positive" minW={0}>
                  {t(`ideas.save.${view}`, { amount: formatMoney(inView(idea.saves, view), currency) })}
                </Text>
                <Button size="sm" flexShrink={0} onClick={() => onTry(idea)}>{t('ideas.try')}</Button>
              </HStack>
            </Panel>
          )
        })}
      </HStack>
    </Box>
  )
}

// ---- Your changes and the apply bar -----------------------------------------------

// "Before → after" for one change, in words.
export function changeLine(item, t) {
  if (item.added) return t(item.kind === 'income' ? 'changes.newIncome' : 'changes.newCost', { amount: perUnit(item.after) })
  if (item.cancelled) return t(item.kind === 'income' ? 'changes.stopLine' : 'changes.cancelLine', { was: perUnit(item.before) })
  return t('changes.editLine', { was: perUnit(item.before), now: perUnit(item.after) })
}

export function ChangesPanel({ sum, currency, onStartOver }) {
  const t = useT('plan')
  return (
    <Panel p={4} as="section" aria-label={t('changes.title', { count: sum.changes.length })}>
      <HStack justify="space-between" mb={1}>
        <SectionLabel>{t('changes.title', { count: sum.changes.length })}</SectionLabel>
        <Button size="sm" variant="ghost" leftIcon={<RotateCcw size={14} />} onClick={onStartOver} mr={-2}>
          {t('changes.startOver')}
        </Button>
      </HStack>
      <Box as="ul" listStyleType="none">
        {sum.changes.map((it) => {
          const eff = effectOf(it)
          return (
            <HStack as="li" key={it.id} spacing={3} py={2.5} borderBottomWidth="1px" borderColor="border.default" align="start">
              <Box pt={0.5}><CategoryBadge category={it.category} kind={it.kind} size={32} /></Box>
              <Box flex="1" minW={0}>
                <Text fontSize="sm" fontWeight="600" noOfLines={1}>{itemName(it)}</Text>
                <Text fontSize="xs" color="text.muted">{changeLine(it, t)}</Text>
                {it.added
                  ? <Text fontSize="xs" color="text.muted" mt={1}>{t('changes.notYet')}</Text>
                  : (
                    <Button as={RouterLink} to={`/recurring/${it.id}`} variant="link" size="xs" color="accent.fg" mt={1}
                      rightIcon={<ExternalLink size={12} />}>{t('changes.open')}</Button>
                  )}
              </Box>
              <Box textAlign="right" flexShrink={0}>
                <Text fontSize="sm" fontWeight="700" color={toneOf(eff)}>{t('changes.perMonth', { amount: signed(monthOf(eff), currency) })}</Text>
                <Text fontSize="xs" color="text.muted">{t('changes.perYear', { amount: signed(eff, currency) })}</Text>
              </Box>
            </HStack>
          )
        })}
      </Box>
      <HStack pt={3} justify="space-between" align="baseline">
        <Text fontSize="sm" fontWeight="700">{t('changes.net')}</Text>
        <Box textAlign="right">
          <Text fontFamily="heading" fontWeight="700" fontSize="lg" color={toneOf(sum.delta)}>
            {t('changes.perMonth', { amount: signed(monthOf(sum.delta), currency) })}
          </Text>
          <Text fontSize="xs" color="text.muted" fontWeight="600">{t('changes.perYear', { amount: signed(sum.delta, currency) })}</Text>
        </Box>
      </HStack>
    </Panel>
  )
}

// Sticks above the phone's tab bar (at the bottom elsewhere): how many
// changes and what they do a month, and "Apply to my recurring…".
export function ApplyBar({ count, delta, currency, onApply }) {
  const t = useT('plan')
  return (
    <Box position={count > 0 ? 'sticky' : 'static'} zIndex={5}
      bottom={{ base: 'calc(76px + env(safe-area-inset-bottom, 0px))', md: 4 }}>
      <Panel p={3} boxShadow="lifted">
        {count > 0 ? (
          <HStack spacing={3}>
            <Box pl={1} flexShrink={0}>
              <Text fontSize="xs" color="text.muted" whiteSpace="nowrap">{t('bar.count', { count })}</Text>
              <Text fontWeight="800" color={toneOf(delta)} whiteSpace="nowrap">
                {t('changes.perMonth', { amount: signed(delta, currency) })}
              </Text>
            </Box>
            <Button flex="1" minW={0} h="auto" minH="48px" py={2} whiteSpace="normal" onClick={onApply}>
              {t('bar.apply')}
            </Button>
          </HStack>
        ) : (
          <HStack spacing={2} justify="center" py={2} color="text.muted">
            <Info size={16} />
            <Text fontSize="sm">{t('bar.hint')}</Text>
          </HStack>
        )}
      </Panel>
    </Box>
  )
}
