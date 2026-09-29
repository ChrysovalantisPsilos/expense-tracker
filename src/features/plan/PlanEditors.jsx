// Plan mode's inline editors — no pop-ups: a row opens in place (amount with
// the live delta, how often, keep or cancel, Reset, Done), "What if I add…"
// opens into its form, and "Try it" on an overlap idea opens the picker under
// the ideas. Plan.jsx keeps one open at a time. Opening one scrolls it into
// view and moves focus into it; Escape (or Done / Cancel) closes it and gives
// focus back to what opened it.
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Box, Button, Checkbox, FormControl, FormHelperText, FormLabel, HStack, Input, InputGroup, InputLeftAddon, Select, SimpleGrid,
  Stack, Text,
} from '@chakra-ui/react'
import CategoryBadge from '../../shared/ui/CategoryBadge.jsx'
import SegmentedControl from '../../shared/ui/SegmentedControl.jsx'
import MoneyInput from '../../shared/ui/MoneyInput.jsx'
import Panel from '../../shared/ui/kit/Panel.jsx'
import Tile from '../../shared/ui/kit/Tile.jsx'
import { formatMoney, formatSigned, minorToInput, toMinor } from '../../shared/lib/currency.js'
import { signTone, textColor } from '../../shared/ui/kit/kitMath.js'
import { shortDate } from '../../shared/lib/dates.js'
import { categoryDisplayName } from '../../shared/lib/categoryName.js'
import { ruleInBase } from '../../shared/lib/ruleFx.js'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'
import { REPEAT_CHOICES, choiceToRule, frequencyLabel, ruleToChoice } from '../recurring/recurringMath.js'
import { NAME_MAX, effectOf, monthOf, overlapPick, yearMinor } from './planMath.js'
import {
  PlanOnlyNote, SCROLL_CLEAR, SignalTag, editorId, openerId,
} from './PlanParts.jsx'
import { ideaText, itemName, monthList, perUnit, serviceCount } from './planText.js'
import CurrencySelect from '../../shared/ui/CurrencySelect.jsx'

// Scroll the editor's item (the row or change with its editor, marked
// data-plan-item) or else the editor into view, and focus its first field,
// when it opens; close on Escape, then focus the opener again.
// Taller than the screen (a phone held sideways): its top goes to the top.
function useInline({ onClose, focusRef, opener }) {
  const boxRef = useRef(null)
  useEffect(() => {
    focusRef.current?.focus({ preventScroll: true })
    const box = boxRef.current
    if (!box) return
    const target = box.closest('[data-plan-item]') ?? box
    const tall = target.getBoundingClientRect().height > window.innerHeight - 180
    target.scrollIntoView({ block: tall ? 'start' : 'nearest', behavior: 'smooth' })
  }, [focusRef])
  const close = () => {
    onClose()
    document.getElementById(openerId(opener))?.focus({ preventScroll: true })
  }
  const onKeyDown = (e) => {
    if (e.key !== 'Escape') return
    e.stopPropagation()
    close()
  }
  return { boxRef, close, onKeyDown }
}

// The editor's box: under what it edits, clear of the header and tab bar
// when it scrolls into view.
function InlineBox({ boxRef, onKeyDown, label, children, ...props }) {
  return (
    <Box ref={boxRef} role="group" aria-label={label} onKeyDown={onKeyDown} borderWidth="1px" borderColor="border.default"
      borderRadius="xl" bg="bg.surface" p={3} sx={SCROLL_CLEAR} {...props}>
      {children}
    </Box>
  )
}

// What a change does, a month and a year: "You'd save +€15.00 a month".
function DeltaTile({ effect, kind, currency }) {
  const t = useT('plan')
  const word = effect === 0 ? 'none'
    : kind === 'income' ? (effect > 0 ? 'get' : 'getLess') : (effect > 0 ? 'save' : 'spend')
  return (
    <Tile py={3} aria-live="polite">
      <HStack justify="space-between" align="baseline" flexWrap="wrap" columnGap={3}>
        <Text fontSize="sm" fontWeight="600">{t(`delta.${word}`)}</Text>
        <Text fontFamily="heading" fontWeight="700" fontSize="lg" color={textColor(signTone(effect))}>
          {t('delta.perMonth', { amount: formatSigned(monthOf(effect), currency, { plus: true }) })}
        </Text>
      </HStack>
      <Text fontSize="xs" color="text.muted" textAlign="right">{t('delta.perYear', { amount: formatSigned(effect, currency, { plus: true }) })}</Text>
    </Tile>
  )
}

// How often: the Repeat choices, plus the rule's own "every N" if it has one.
function FrequencySelect({ fields, onChange, isDisabled, id }) {
  const t = useT('plan')
  const { choice, n } = ruleToChoice(fields)
  const custom = n > 1
  return (
    <FormControl isDisabled={isDisabled}>
      <FormLabel htmlFor={id}>{t('edit.howOften')}</FormLabel>
      <Select id={id} value={custom ? 'custom' : choice}
        onChange={(e) => e.target.value !== 'custom' && onChange(choiceToRule(e.target.value, 1))}>
        {custom && <option value="custom">{frequencyLabel(fields)}</option>}
        {REPEAT_CHOICES.map(([v, key]) => <option key={v} value={v}>{t(key)}</option>)}
      </Select>
    </FormControl>
  )
}

function AmountField({ id, label, text, onText, currency, inputRef, isDisabled, addon, help }) {
  return (
    <FormControl isDisabled={isDisabled}>
      <FormLabel htmlFor={id}>{label}</FormLabel>
      <InputGroup>
        {addon && <InputLeftAddon bg="bg.subtle" borderColor="border.default" px={3}>{addon}</InputLeftAddon>}
        <MoneyInput ref={inputRef} id={id} currency={currency} value={text} onChange={onText} fontWeight="700" />
      </InputGroup>
      {help && <FormHelperText fontSize="xs" color="text.muted">{help}</FormHelperText>}
    </FormControl>
  )
}

// Why a row carries a tag, in a line.
function SignalDetail({ signal }) {
  const t = useT('plan')
  const shown = signal.priceUp ? 'priceUp' : signal.overlap ? 'overlap' : signal.overBudget ? 'overBudget' : null
  if (!shown) return null
  const text = shown === 'priceUp'
    ? t('edit.detail.priceUp', {
      from: formatMoney(signal.priceUp.from, signal.priceUp.currency),
      to: formatMoney(signal.priceUp.to, signal.priceUp.currency), date: shortDate(signal.priceUp.since),
    })
    : shown === 'overlap' ? t('edit.detail.overlap', { services: serviceCount(signal.overlap.type, signal.overlap.count, t) })
      : t('edit.detail.overBudget', { months: monthList(signal.overBudget.months) })
  return (
    <HStack spacing={2} align="start">
      <SignalTag tag={{ kind: shown, pct: signal.priceUp?.pct }} />
      <Text fontSize="xs" color="text.muted">{text}</Text>
    </HStack>
  )
}

// One real row, opened in place under its row or its entry in "Your changes"
// (`opener`, see PlanParts.openerId): amount (with the live delta), how
// often, keep or cancel, Reset and Done. The derived Salary row stays monthly
// (no "how often") and says its change is only in the plan.
export function EditForm({ item, opener, signal, currency, onChange, onReset, onClose }) {
  const t = useT('plan')
  const amountRef = useRef(null)
  const { boxRef, close, onKeyDown } = useInline({ onClose, focusRef: amountRef, opener })
  const fields = item.after ?? item.before
  const [text, setText] = useState(() => minorToInput(fields.amount_minor, fields.currency))
  const name = itemName(item)
  const income = item.kind === 'income'

  function onText(v) {
    setText(v)
    const minor = toMinor(v, fields.currency)
    if (minor > 0) onChange({ amount_minor: minor })
  }
  function reset() {
    onReset()
    setText(minorToInput(item.before.amount_minor, item.before.currency))
  }

  return (
    <InlineBox id={editorId(opener)} boxRef={boxRef} onKeyDown={onKeyDown} label={name} mb={2}>
      <Stack spacing={3}>
        {signal && <SignalDetail signal={signal} />}
        {item.salary && <PlanOnlyNote text={t('edit.salaryNote')} />}
        <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={3} alignItems="start">
          <AmountField id={`plan-amount-${opener}`} label={t('edit.amount')} text={text} onText={onText} inputRef={amountRef}
            currency={fields.currency} addon={fields.currency} isDisabled={item.cancelled}
            help={t(item.salary ? 'edit.salaryNow' : 'edit.now', { amount: perUnit(item.before) })} />
          {item.salary ? <DeltaTile effect={effectOf(item)} kind={item.kind} currency={currency} /> : (
            <FrequencySelect id={`plan-frequency-${opener}`} fields={fields} isDisabled={item.cancelled}
              onChange={(f) => onChange(f)} />
          )}
        </SimpleGrid>
        <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={3} alignItems="end">
          {!item.salary && <DeltaTile effect={effectOf(item)} kind={item.kind} currency={currency} />}
          <Box>
            <Text fontSize="sm" fontWeight="600" mb={1.5}>{t('edit.inPlan')}</Text>
            <SegmentedControl label={t('edit.inPlan')} size="sm" isFitted value={item.cancelled ? 'cancel' : 'keep'}
              onChange={(v) => onChange({ cancel: v === 'cancel' })}
              options={[['keep', t('edit.keep')], ['cancel', t(income ? 'edit.stop' : 'edit.cancel')]]} />
          </Box>
        </SimpleGrid>
        <HStack justify="space-between">
          <Button variant="ghost" color="accent.fg" onClick={reset} isDisabled={!item.changed}>{t('edit.reset')}</Button>
          <Button minW="96px" onClick={close}>{t('edit.done')}</Button>
        </HStack>
      </Stack>
    </InlineBox>
  )
}

const newId = () => (globalThis.crypto?.randomUUID?.() ?? `add-${Date.now()}-${Math.random().toString(36).slice(2)}`)

// "What if I add…": a new cost or income, only in the plan, in place. `add`
// edits one already in the plan (its row's switch, or "Remove" in "Your
// changes", takes it out). `opener` is what
// opened it ('new' for "What if I add…", else the added row or its entry in
// "Your changes": PlanParts.openerId).
export function AddForm({ add, opener, categories, todayISO, currency, rates, onSave, onClose }) {
  const t = useT('plan')
  const nameRef = useRef(null)
  const { boxRef, close, onKeyDown } = useInline({ onClose, focusRef: nameRef, opener })
  const [kind, setKind] = useState(add?.kind ?? 'expense')
  const [name, setName] = useState(add?.name ?? '')
  const [cur, setCur] = useState(add?.currency ?? currency)
  const [text, setText] = useState(add ? minorToInput(add.amount_minor, add.currency) : '')
  const [freq, setFreq] = useState(add ? { frequency: add.frequency, interval_n: add.interval_n } : choiceToRule('monthly'))
  const [start, setStart] = useState(add?.start ?? todayISO)
  const [categoryId, setCategoryId] = useState(add?.category_id ?? '')
  const amount = toMinor(text || '0', cur)
  const choices = useMemo(() => categories.filter((c) => c.kind === kind && !c.is_archived && !(c.is_savings && kind === 'income')),
    [categories, kind])
  const ready = amount > 0 && name.trim() && /^\d{4}-\d{2}-\d{2}$/.test(start)
  // The live delta in the base currency, at today's rate (none yet for a
  // currency whose rate hasn't arrived: it's fetched once the add is saved).
  const inBase = ruleInBase({ amount_minor: amount, currency: cur, ...freq }, currency, rates)
  const effect = inBase ? (kind === 'income' ? 1 : -1) * yearMinor(inBase) : 0

  function pickKind(k) { setKind(k); setCategoryId('') }
  function save() {
    if (!ready) return
    onSave({
      id: add?.id ?? newId(), kind, name: name.trim(), amount_minor: amount, currency: cur,
      ...freq, start, category_id: categoryId || null,
    })
    close()
  }

  return (
    <InlineBox id={editorId(opener)} boxRef={boxRef} onKeyDown={onKeyDown} label={add?.name || t('whatIf.title')}
      mt={add ? 0 : 2} mb={add ? 2 : 0}>
      <Stack as="form" spacing={4} onSubmit={(e) => { e.preventDefault(); save() }}>
        <SegmentedControl label={t('add.kind')} size="sm" isFitted value={kind} onChange={pickKind}
          options={[['expense', t('add.cost')], ['income', t('add.income')]]} />
        <FormControl isRequired>
          <FormLabel htmlFor={`plan-name-${opener}`}>{t('add.name')}</FormLabel>
          <Input ref={nameRef} id={`plan-name-${opener}`} value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)}
            placeholder={t(`add.placeholder.${kind}`)} />
        </FormControl>
        <HStack align="end" spacing={3}>
          <Box flex="1" minW={0}>
            <AmountField id={`plan-amount-${opener}`} label={t('add.amount')} text={text} onText={setText} currency={cur} />
          </Box>
          <FormControl w="112px" flexShrink={0}>
            <FormLabel htmlFor={`plan-currency-${opener}`}>{t('add.currency')}</FormLabel>
            <CurrencySelect id={`plan-currency-${opener}`} value={cur} onChange={setCur} />
          </FormControl>
        </HStack>
        <HStack align="end" spacing={3}>
          <Box flex="1" minW={0}>
            <FrequencySelect id={`plan-frequency-${opener}`} fields={freq} onChange={setFreq} />
          </Box>
          <FormControl flex="1" minW={0}>
            <FormLabel htmlFor={`plan-start-${opener}`}>{t('add.starts')}</FormLabel>
            <Input id={`plan-start-${opener}`} type="date" value={start} min={todayISO} onChange={(e) => setStart(e.target.value)} />
          </FormControl>
        </HStack>
        <FormControl>
          <FormLabel htmlFor={`plan-category-${opener}`}>{t('add.category')}</FormLabel>
          <Select id={`plan-category-${opener}`} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">{t('add.noCategory')}</option>
            {choices.map((c) => <option key={c.id} value={c.id}>{categoryDisplayName(c)}</option>)}
          </Select>
        </FormControl>
        <DeltaTile effect={effect} kind={kind} currency={currency} />
        <HStack spacing={2} justify="flex-end">
          <Button variant="ghost" onClick={close}>{t('common:actions.cancel')}</Button>
          <Button type="submit" isDisabled={!ready}>{t(add ? 'add.update' : 'add.submit')}</Button>
        </HStack>
      </Stack>
    </InlineBox>
  )
}

// "Try it" on an overlap idea, in place under the ideas: the user picks which
// to cancel, dearest first, none ticked; the saving follows the ticks.
export function PickPanel({ idea, items, currency, onAdd, onClose }) {
  const t = useT('plan')
  const firstRef = useRef(null)
  const { boxRef, close, onKeyDown } = useInline({ onClose, focusRef: firstRef, opener: idea.id })
  const [picked, setPicked] = useState(() => new Set())
  const { rows, saves } = overlapPick(items, idea, picked)
  const toggle = (id) => setPicked((s) => {
    const next = new Set(s)
    if (!next.delete(id)) next.add(id)
    return next
  })
  const title = ideaText(idea, currency, t).name
  return (
    <Panel id={editorId(idea.id)} ref={boxRef} role="group" aria-label={title} onKeyDown={onKeyDown} p={4}
      sx={SCROLL_CLEAR}>
      <Text fontFamily="heading" fontWeight="700" fontSize="md" lineHeight="1.25">{title}</Text>
      <Text fontSize="xs" color="text.muted" mt={0.5}>{t('pick.sub')}</Text>
      <Box mt={1}>
        {rows.map((it, n) => (
          <Checkbox key={it.id} ref={n === 0 ? firstRef : undefined} size="lg" isChecked={picked.has(it.id)} w="full" py={2.5}
            borderBottomWidth="1px" borderColor="border.default" onChange={() => toggle(it.id)}
            sx={{ '.chakra-checkbox__label': { flex: 1, ml: 3, minW: 0 } }}>
            <HStack spacing={3} w="full">
              <CategoryBadge category={it.category} kind={it.kind} size={32} />
              <Box flex="1" minW={0}>
                <Text fontSize="sm" fontWeight="600" noOfLines={1}>{itemName(it)}</Text>
                <Text fontSize="xs" color="text.muted">{t('pick.perYear', { amount: formatMoney(it.beforeYear, currency) })}</Text>
              </Box>
              <Text fontSize="sm" fontWeight="700" whiteSpace="nowrap">
                {t('changes.perMonth', { amount: formatMoney(monthOf(it.beforeYear), currency) })}
              </Text>
            </HStack>
          </Checkbox>
        ))}
      </Box>
      <Tile py={3} mt={4} aria-live="polite">
        <HStack justify="space-between" align="baseline" flexWrap="wrap" columnGap={3}>
          <Text fontSize="sm" fontWeight="600">
            {picked.size ? t('pick.cancelOf', { picked: picked.size, count: rows.length }) : t('pick.none')}
          </Text>
          <Text fontFamily="heading" fontWeight="700" fontSize="lg" color={textColor(signTone(saves))}>
            {t('delta.perMonth', { amount: formatSigned(monthOf(saves), currency, { plus: true }) })}
          </Text>
        </HStack>
        <Text fontSize="xs" color="text.muted" textAlign="right">
          {saves ? t('pick.saveYear', { amount: formatSigned(saves, currency, { plus: true }) }) : t('pick.hint')}
        </Text>
      </Tile>
      <HStack spacing={2} justify="flex-end" mt={4}>
        <Button variant="ghost" onClick={close}>{t('common:actions.cancel')}</Button>
        <Button isDisabled={!picked.size} onClick={() => { onAdd(rows.filter((r) => picked.has(r.id))); close() }}>
          {picked.size ? t('pick.add', { count: picked.size }) : t('pick.addNone')}
        </Button>
      </HStack>
    </Panel>
  )
}
