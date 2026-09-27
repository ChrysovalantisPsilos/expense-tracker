// Plan mode's bottom sheets: edit a row, "What if I add…", pick which
// overlapping payments to cancel, and apply the plan to the real rules.
import { useMemo, useRef, useState } from 'react'
import {
  Box, Button, Checkbox, Drawer, DrawerBody, DrawerContent, DrawerFooter, DrawerOverlay, FormControl, FormLabel,
  HStack, Input, InputGroup, InputLeftAddon, Select, Stack, Text,
} from '@chakra-ui/react'
import { AlertTriangle, Plus } from 'lucide-react'
import CategoryBadge from '../../shared/ui/CategoryBadge.jsx'
import SegmentedControl from '../../shared/ui/SegmentedControl.jsx'
import MoneyInput from '../../shared/ui/MoneyInput.jsx'
import Tile from '../../shared/ui/kit/Tile.jsx'
import IconTile from '../../shared/ui/kit/IconTile.jsx'
import { CURRENCIES, formatMoney, minorToInput, toMinor } from '../../shared/lib/currency.js'
import { shortDate } from '../../shared/lib/dates.js'
import { categoryDisplayName } from '../../shared/lib/categoryName.js'
import { ruleInBase } from '../../shared/lib/ruleFx.js'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'
import { REPEAT_CHOICES, choiceToRule, frequencyLabel, ruleToChoice } from '../recurring/recurringMath.js'
import { NAME_MAX, effectOf, monthOf, overlapPick, yearMinor } from './planMath.js'
import { SignalTag, ideaText, itemName, monthList, perUnit, signed, toneOf } from './PlanParts.jsx'

function Sheet({ children, onClose, initialFocusRef, label }) {
  return (
    <Drawer isOpen placement="bottom" onClose={onClose} initialFocusRef={initialFocusRef}>
      <DrawerOverlay />
      <DrawerContent borderTopRadius="2xl" pb="env(safe-area-inset-bottom, 0px)"
        sx={{ maxWidth: '560px !important', marginInline: 'auto' }}
        maxH="92dvh" aria-label={label}>
        <Box w="40px" h="4px" borderRadius="full" bg="border.default" mx="auto" mt={2} flexShrink={0} />
        {children}
      </DrawerContent>
    </Drawer>
  )
}

function SheetHead({ media, title, sub, action }) {
  return (
    <HStack px={5} pt={3} pb={1} spacing={3} align="center">
      {media}
      <Box flex="1" minW={0}>
        <Text fontFamily="heading" fontWeight="700" fontSize="lg" lineHeight="1.2">{title}</Text>
        {sub && <Text fontSize="xs" color="text.muted">{sub}</Text>}
      </Box>
      {action}
    </HStack>
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
        <Text fontFamily="heading" fontWeight="700" fontSize="lg" color={toneOf(effect)}>
          {t('delta.perMonth', { amount: signed(monthOf(effect), currency) })}
        </Text>
      </HStack>
      <Text fontSize="xs" color="text.muted" textAlign="right">{t('delta.perYear', { amount: signed(effect, currency) })}</Text>
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

function AmountField({ id, label, text, onText, currency, inputRef, isDisabled, addon }) {
  return (
    <FormControl isDisabled={isDisabled}>
      <FormLabel htmlFor={id}>{label}</FormLabel>
      <InputGroup>
        {addon && <InputLeftAddon bg="bg.subtle" borderColor="border.default" px={3}>{addon}</InputLeftAddon>}
        <MoneyInput ref={inputRef} id={id} currency={currency} value={text} onChange={onText} fontWeight="700" />
      </InputGroup>
    </FormControl>
  )
}

// The edit sheet for one real row: amount (with the live delta), how often,
// keep or cancel, and Reset.
export function EditSheet({ item, signal, currency, onChange, onReset, onClose }) {
  const t = useT('plan')
  const amountRef = useRef(null)
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
    <Sheet onClose={onClose} initialFocusRef={amountRef} label={name}>
      <SheetHead media={<CategoryBadge category={item.category} kind={item.kind} size={40} />}
        title={name} sub={t('edit.now', { amount: perUnit(item.before) })}
        action={<Button variant="ghost" size="sm" color="accent.fg" onClick={reset} isDisabled={!item.changed}>{t('edit.reset')}</Button>} />
      <DrawerBody px={5} pt={3} pb={2}>
        <Stack spacing={4}>
          {signal && <SignalDetail signal={signal} />}
          <AmountField id="plan-edit-amount" label={t('edit.amount')} text={text} onText={onText} inputRef={amountRef}
            currency={fields.currency} addon={fields.currency} isDisabled={item.cancelled} />
          <DeltaTile effect={effectOf(item)} kind={item.kind} currency={currency} />
          <FrequencySelect id="plan-edit-frequency" fields={fields} isDisabled={item.cancelled}
            onChange={(f) => onChange(f)} />
          <Box>
            <Text fontSize="sm" fontWeight="600" mb={1.5}>{t('edit.inPlan')}</Text>
            <SegmentedControl label={t('edit.inPlan')} size="sm" isFitted value={item.cancelled ? 'cancel' : 'keep'}
              onChange={(v) => onChange({ cancel: v === 'cancel' })}
              options={[['keep', t('edit.keep')], ['cancel', t(income ? 'edit.stop' : 'edit.cancel')]]} />
          </Box>
        </Stack>
      </DrawerBody>
      <DrawerFooter px={5} pt={2} pb={4}>
        <Button size="lg" w="full" onClick={onClose}>{t('edit.done')}</Button>
      </DrawerFooter>
    </Sheet>
  )
}

// Why a row carries a tag, in a line.
function SignalDetail({ signal }) {
  const t = useT('plan')
  const [kind, text] = signal.priceUp
    ? ['priceUp', t('edit.detail.priceUp', {
      from: formatMoney(signal.priceUp.from, signal.priceUp.currency),
      to: formatMoney(signal.priceUp.to, signal.priceUp.currency), date: shortDate(signal.priceUp.since),
    })]
    : signal.overlap ? ['overlap', t('edit.detail.overlap', { count: signal.overlap.count })]
      : ['overBudget', t('edit.detail.overBudget', { months: monthList(signal.overBudget.months) })]
  return (
    <HStack spacing={2} align="start">
      <SignalTag tag={{ kind, pct: signal.priceUp?.pct }} />
      <Text fontSize="xs" color="text.muted">{text}</Text>
    </HStack>
  )
}

const newId = () => (globalThis.crypto?.randomUUID?.() ?? `add-${Date.now()}-${Math.random().toString(36).slice(2)}`)

// "What if I add…": a new cost or income, only in the plan. `add` edits one
// already in the plan (then it can be removed).
export function AddSheet({ add, categories, todayISO, currency, rates, onSave, onRemove, onClose }) {
  const t = useT('plan')
  const nameRef = useRef(null)
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
  }

  return (
    <Sheet onClose={onClose} initialFocusRef={nameRef} label={t('add.title')}>
      <SheetHead media={<IconTile icon={Plus} size={40} radius="xl" />} title={t('add.title')} sub={t('add.sub')} />
      <DrawerBody px={5} pt={3} pb={2}>
        <Stack as="form" id="plan-add-form" spacing={4} onSubmit={(e) => { e.preventDefault(); save() }}>
          <SegmentedControl label={t('add.kind')} size="sm" isFitted value={kind} onChange={pickKind}
            options={[['expense', t('add.cost')], ['income', t('add.income')]]} />
          <FormControl isRequired>
            <FormLabel htmlFor="plan-add-name">{t('add.name')}</FormLabel>
            <Input ref={nameRef} id="plan-add-name" value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)}
              placeholder={t(`add.placeholder.${kind}`)} />
          </FormControl>
          <HStack align="end" spacing={3}>
            <Box flex="1" minW={0}>
              <AmountField id="plan-add-amount" label={t('add.amount')} text={text} onText={setText} currency={cur} />
            </Box>
            <FormControl w="112px" flexShrink={0}>
              <FormLabel htmlFor="plan-add-currency">{t('add.currency')}</FormLabel>
              <Select id="plan-add-currency" value={cur} onChange={(e) => setCur(e.target.value)}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </FormControl>
          </HStack>
          <HStack align="end" spacing={3}>
            <Box flex="1" minW={0}>
              <FrequencySelect id="plan-add-frequency" fields={freq} onChange={setFreq} />
            </Box>
            <FormControl flex="1" minW={0}>
              <FormLabel htmlFor="plan-add-start">{t('add.starts')}</FormLabel>
              <Input id="plan-add-start" type="date" value={start} min={todayISO} onChange={(e) => setStart(e.target.value)} />
            </FormControl>
          </HStack>
          <FormControl>
            <FormLabel htmlFor="plan-add-category">{t('add.category')}</FormLabel>
            <Select id="plan-add-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">{t('add.noCategory')}</option>
              {choices.map((c) => <option key={c.id} value={c.id}>{categoryDisplayName(c)}</option>)}
            </Select>
          </FormControl>
          <DeltaTile effect={effect} kind={kind} currency={currency} />
        </Stack>
      </DrawerBody>
      <DrawerFooter px={5} pt={2} pb={4} flexDir="column" gap={1}>
        <Button size="lg" w="full" type="submit" form="plan-add-form" isDisabled={!ready}>
          {t(add ? 'add.update' : 'add.submit')}
        </Button>
        {add && <Button w="full" variant="ghost" colorScheme="red" onClick={onRemove}>{t('add.remove')}</Button>}
      </DrawerFooter>
    </Sheet>
  )
}

// "Try it" on an overlap idea: the user picks which ones to cancel, dearest
// first, none ticked; the saving follows the ticks.
export function PickSheet({ idea, items, currency, onAdd, onClose }) {
  const t = useT('plan')
  const [picked, setPicked] = useState(() => new Set())
  const { rows, saves } = overlapPick(items, idea, picked)
  const toggle = (id) => setPicked((s) => {
    const next = new Set(s)
    if (!next.delete(id)) next.add(id)
    return next
  })
  const title = ideaText(idea, currency, t).name
  return (
    <Sheet onClose={onClose} label={title}>
      <SheetHead title={title} sub={t('pick.sub')} />
      <DrawerBody px={5} pt={1} pb={2}>
        {rows.map((it) => (
          <Checkbox key={it.id} size="lg" isChecked={picked.has(it.id)} w="full" py={2.5}
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
        <Tile py={3} mt={4} aria-live="polite">
          <HStack justify="space-between" align="baseline" flexWrap="wrap" columnGap={3}>
            <Text fontSize="sm" fontWeight="600">
              {picked.size ? t('pick.cancelOf', { picked: picked.size, count: rows.length }) : t('pick.none')}
            </Text>
            <Text fontFamily="heading" fontWeight="700" fontSize="lg" color={toneOf(saves)}>
              {t('delta.perMonth', { amount: signed(monthOf(saves), currency) })}
            </Text>
          </HStack>
          <Text fontSize="xs" color="text.muted" textAlign="right">
            {saves ? t('pick.saveYear', { amount: signed(saves, currency) }) : t('pick.hint')}
          </Text>
        </Tile>
      </DrawerBody>
      <DrawerFooter px={5} pt={2} pb={4}>
        <Button size="lg" w="full" isDisabled={!picked.size}
          onClick={() => onAdd(rows.filter((r) => picked.has(r.id)))}>
          {picked.size ? t('pick.add', { count: picked.size }) : t('pick.addNone')}
        </Button>
      </DrawerFooter>
    </Sheet>
  )
}

// What Apply will do to one change, in words.
function applyLine(item, t) {
  if (item.added) return t(item.kind === 'income' ? 'apply.newIncome' : 'apply.newCost', { date: shortDate(item.next) })
  if (item.cancelled) return t('apply.stops')
  return t('apply.editLine', { amount: perUnit(item.after), date: shortDate(item.next) })
}

// Pick, then confirm: every change ticked; the warning shows before the button.
export function ApplySheet({ sum, currency, busy, onApply, onClose }) {
  const t = useT('plan')
  const [off, setOff] = useState(() => new Set())
  const picked = sum.changes.filter((c) => !off.has(c.id))
  const effect = picked.reduce((s, it) => s + effectOf(it), 0)
  const toggle = (id) => setOff((s) => {
    const next = new Set(s)
    if (!next.delete(id)) next.add(id)
    return next
  })
  return (
    <Sheet onClose={onClose} label={t('apply.title')}>
      <SheetHead title={t('apply.title')} sub={t('apply.sub')} />
      <DrawerBody px={5} pt={0} pb={2}>
        {sum.changes.map((it) => {
          const eff = effectOf(it)
          return (
            <Checkbox key={it.id} size="lg" isChecked={!off.has(it.id)} w="full" py={2}
              borderBottomWidth="1px" borderColor="border.default" onChange={() => toggle(it.id)}
              sx={{ '.chakra-checkbox__label': { flex: 1, ml: 3, minW: 0 } }}>
              <HStack spacing={3} w="full">
                <CategoryBadge category={it.category} kind={it.kind} size={32} />
                <Box flex="1" minW={0}>
                  <Text fontSize="sm" fontWeight="600" noOfLines={1}>{itemName(it)}</Text>
                  <Text fontSize="xs" color="text.muted">{applyLine(it, t)}</Text>
                </Box>
                <Text fontSize="sm" fontWeight="700" color={toneOf(eff)} whiteSpace="nowrap">
                  {t('changes.perMonth', { amount: signed(monthOf(eff), currency) })}
                </Text>
              </HStack>
            </Checkbox>
          )
        })}
      </DrawerBody>
      {/* The net and the warning stay in view above the button, however
          long the list (a phone held sideways scrolls the list instead). */}
      <DrawerFooter px={5} pt={2} pb={3} flexDir="column" gap={1} alignItems="stretch">
        <HStack justify="space-between" flexWrap="wrap" columnGap={3}>
          <Text fontSize="sm" color="text.muted">{t('apply.netAfter')}</Text>
          <Text fontSize="sm" fontWeight="700">
            {t('apply.netValue', { amount: formatMoney(monthOf(sum.before + effect), currency) })}
          </Text>
        </HStack>
        <HStack role="note" align="start" spacing={2.5} my={2} bg="status.warningSubtle" borderWidth="1px"
          borderColor="status.warningBorder" borderRadius="lg" px={3} py={2.5}>
          <Box color="status.warning" mt="2px" flexShrink={0}><AlertTriangle size={16} /></Box>
          <Box fontSize="xs">
            <Text fontWeight="700">{t('apply.warnTitle')}</Text>
            <Text mt={0.5}>{t('apply.warnBody')}</Text>
          </Box>
        </HStack>
        <Button size="lg" w="full" isDisabled={!picked.length} isLoading={busy}
          onClick={() => onApply(new Set(picked.map((p) => p.id)))}>
          {t('apply.submit', { count: picked.length })}
        </Button>
        <Button w="full" variant="ghost" onClick={onClose}>{t('apply.notNow')}</Button>
      </DrawerFooter>
    </Sheet>
  )
}
