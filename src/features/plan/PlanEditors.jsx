// Plan mode's inline editors — no pop-ups: a row opens in place (amount with
// the live delta, how often, keep or cancel, Reset, Done), "What if I add…"
// opens into its form, and "Try it" on an overlap idea opens the picker under
// the ideas. Plan.jsx keeps one open at a time (the "Type a what-if" preview,
// PlanWhatIf.jsx, counts as one and reuses the fields here). Opening one scrolls it into
// view and moves focus into it; Escape (or Done / Cancel) closes it and gives
// focus back to what opened it.
import { useEffect, useRef, useState } from 'react'
import {
  Box, Button, Checkbox, FormControl, FormHelperText, FormLabel, HStack, Input, InputGroup, InputLeftAddon, Select, SimpleGrid,
  Stack, Text,
} from '@chakra-ui/react'
import CategoryBadge from '../../shared/ui/CategoryBadge.jsx'
import SegmentedControl from '../../shared/ui/SegmentedControl.jsx'
import MoneyInput from '../../shared/ui/MoneyInput.jsx'
import Panel from '../../shared/ui/kit/Panel.jsx'
import Tile from '../../shared/ui/kit/Tile.jsx'
import { textColor } from '../../shared/ui/kit/kitMath.js'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'
import { NAME_MAX } from './planMath.js'
import {
  addDraft, addFormParts, addKind, addToSave, amountEdit, badgeKind, editorParts, frequencyOptions, frequencyPick, pickParts,
} from './planPage.js'
import { PlanOnlyNote, SCROLL_CLEAR, SignalTag, editorId, openerId } from './PlanParts.jsx'
import { itemName } from './planText.js'
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

// What a change does, a month and a year: "You'd save +€15.00 a month"
// (planPage.deltaParts).
function DeltaTile({ delta }) {
  return (
    <Tile py={3} aria-live="polite">
      <HStack justify="space-between" align="baseline" flexWrap="wrap" columnGap={3}>
        <Text fontSize="sm" fontWeight="600">{delta.word}</Text>
        <Text fontFamily="heading" fontWeight="700" fontSize="lg" color={textColor(delta.tone)}>{delta.perMonth}</Text>
      </HStack>
      <Text fontSize="xs" color="text.muted" textAlign="right">{delta.perYear}</Text>
    </Tile>
  )
}

// How often: the Repeat choices, plus the rule's own "every N" if it has one
// (planPage.frequencyOptions).
export function FrequencySelect({ fields, onChange, isDisabled, id }) {
  const t = useT('plan')
  const freq = frequencyOptions(fields)
  return (
    <FormControl isDisabled={isDisabled}>
      <FormLabel htmlFor={id}>{t('edit.howOften')}</FormLabel>
      <Select id={id} value={freq.value} onChange={(e) => { const f = frequencyPick(e.target.value); if (f) onChange(f) }}>
        {freq.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </Select>
    </FormControl>
  )
}

export function AmountField({ id, label, text, onText, currency, inputRef, isDisabled, addon, help }) {
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

// One real row, opened in place under its row or its entry in "Your changes"
// (`opener`, see PlanParts.openerId): why it's tagged, amount (with the live
// delta), how often, keep or cancel (stop, for income and savings), Reset and
// Done. A derived row (Salary, Savings) stays monthly (no "how often") and
// says its change is only in the plan. The words: planPage.editorParts.
export function EditForm({ item, opener, signal, currency, onChange, onReset, onClose }) {
  const t = useT('plan')
  const amountRef = useRef(null)
  const { boxRef, close, onKeyDown } = useInline({ onClose, focusRef: amountRef, opener })
  const parts = editorParts(item, signal, currency)
  const [text, setText] = useState(parts.text)
  const name = itemName(item)

  function onText(v) {
    setText(v)
    const patch = amountEdit(v, parts.currency)
    if (patch) onChange(patch)
  }
  function reset() {
    onReset()
    setText(parts.resetText)
  }

  const delta = <DeltaTile delta={parts.delta} />
  return (
    <InlineBox id={editorId(opener)} boxRef={boxRef} onKeyDown={onKeyDown} label={name} mb={2}>
      <Stack spacing={3}>
        {parts.signal && (
          <HStack spacing={2} align="start">
            <SignalTag tag={parts.signal.tag} />
            <Text fontSize="xs" color="text.muted">{parts.signal.text}</Text>
          </HStack>
        )}
        {parts.note && <PlanOnlyNote text={parts.note} />}
        <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={3} alignItems="start">
          <AmountField id={`plan-amount-${opener}`} label={t('edit.amount')} text={text} onText={onText} inputRef={amountRef}
            currency={parts.currency} addon={parts.currency} isDisabled={parts.cancelled} help={parts.help} />
          {parts.frequency ? (
            <FrequencySelect id={`plan-frequency-${opener}`} fields={item.after ?? item.before} isDisabled={parts.cancelled}
              onChange={(f) => onChange(f)} />
          ) : delta}
        </SimpleGrid>
        <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={3} alignItems="end">
          {parts.frequency && delta}
          <Box>
            <Text fontSize="sm" fontWeight="600" mb={1.5}>{t('edit.inPlan')}</Text>
            <SegmentedControl label={t('edit.inPlan')} size="sm" isFitted value={parts.cancelled ? 'cancel' : 'keep'}
              onChange={(v) => onChange({ cancel: v === 'cancel' })}
              options={parts.keep.map((o) => [o.value, o.label])} />
          </Box>
        </SimpleGrid>
        <HStack justify="space-between">
          <Button variant="ghost" color="accent.fg" onClick={reset} isDisabled={!parts.canReset}>{t('edit.reset')}</Button>
          <Button minW="96px" onClick={close}>{t('edit.done')}</Button>
        </HStack>
      </Stack>
    </InlineBox>
  )
}

export const newId = () => (globalThis.crypto?.randomUUID?.() ?? `add-${Date.now()}-${Math.random().toString(36).slice(2)}`)

// "What if I add…": a new cost, income or savings (money set aside from
// income each time: offered once there's a savings category, which it must
// name — the first one is picked), only in the plan, in place. `add`
// edits one already in the plan (its row's switch, or "Remove" in "Your
// changes", takes it out). `opener` is what
// opened it ('new' for "What if I add…", else the added row or its entry in
// "Your changes": PlanParts.openerId).
export function AddForm({ add, opener, categories, todayISO, currency, rates, onSave, onClose }) {
  const t = useT('plan')
  const nameRef = useRef(null)
  const { boxRef, close, onKeyDown } = useInline({ onClose, focusRef: nameRef, opener })
  const [draft, setDraft] = useState(() => addDraft(add, currency, todayISO))
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }))
  const parts = addFormParts(draft, { categories, currency, rates, editing: !!add })

  function save() {
    const ready = addToSave(draft, add?.id ?? newId())
    if (!ready) return
    onSave(ready)
    close()
  }

  return (
    <InlineBox id={editorId(opener)} boxRef={boxRef} onKeyDown={onKeyDown} label={add?.name || t('whatIf.title')}
      mt={add ? 0 : 2} mb={add ? 2 : 0}>
      <Stack as="form" spacing={4} onSubmit={(e) => { e.preventDefault(); save() }}>
        <SegmentedControl label={t('add.kind')} size="sm" isFitted value={draft.kind}
          onChange={(k) => setDraft((d) => addKind(d, k, categories))} options={parts.kinds.map((o) => [o.value, o.label])} />
        <FormControl isRequired>
          <FormLabel htmlFor={`plan-name-${opener}`}>{t('add.name')}</FormLabel>
          <Input ref={nameRef} id={`plan-name-${opener}`} value={draft.name} maxLength={NAME_MAX}
            onChange={(e) => set({ name: e.target.value })} placeholder={parts.placeholder} />
        </FormControl>
        <HStack align="end" spacing={3}>
          <Box flex="1" minW={0}>
            <AmountField id={`plan-amount-${opener}`} label={t('add.amount')} text={draft.text}
              onText={(v) => set({ text: v })} currency={draft.currency} />
          </Box>
          <FormControl w="112px" flexShrink={0}>
            <FormLabel htmlFor={`plan-currency-${opener}`}>{t('add.currency')}</FormLabel>
            <CurrencySelect id={`plan-currency-${opener}`} value={draft.currency} onChange={(c) => set({ currency: c })} />
          </FormControl>
        </HStack>
        <HStack align="end" spacing={3}>
          <Box flex="1" minW={0}>
            <FrequencySelect id={`plan-frequency-${opener}`} fields={draft} onChange={set} />
          </Box>
          <FormControl flex="1" minW={0}>
            <FormLabel htmlFor={`plan-start-${opener}`}>{t('add.starts')}</FormLabel>
            <Input id={`plan-start-${opener}`} type="date" value={draft.start} min={todayISO}
              onChange={(e) => set({ start: e.target.value })} />
          </FormControl>
        </HStack>
        <FormControl>
          <FormLabel htmlFor={`plan-category-${opener}`}>{parts.categoryLabel}</FormLabel>
          <Select id={`plan-category-${opener}`} value={draft.categoryId} onChange={(e) => set({ categoryId: e.target.value })}>
            {parts.noCategory && <option value="">{parts.noCategory}</option>}
            {parts.categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </Select>
        </FormControl>
        <DeltaTile delta={parts.delta} />
        <HStack spacing={2} justify="flex-end">
          <Button variant="ghost" onClick={close}>{t('common:actions.cancel')}</Button>
          <Button type="submit" isDisabled={!parts.ready}>{parts.submit}</Button>
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
  const [picked, setPicked] = useState([])
  const parts = pickParts(items, idea, picked, currency)
  const byId = new Map(items.map((i) => [i.id, i]))
  const toggle = (id) => setPicked((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]))
  return (
    <Panel id={editorId(idea.id)} ref={boxRef} role="group" aria-label={parts.title} onKeyDown={onKeyDown} p={4}
      sx={SCROLL_CLEAR}>
      <Text fontFamily="heading" fontWeight="700" fontSize="md" lineHeight="1.25">{parts.title}</Text>
      <Text fontSize="xs" color="text.muted" mt={0.5}>{t('pick.sub')}</Text>
      <Box mt={1}>
        {parts.rows.map((row, n) => {
          const it = byId.get(row.id)
          return (
            <Checkbox key={row.id} ref={n === 0 ? firstRef : undefined} size="lg" isChecked={row.picked} w="full" py={2.5}
              borderBottomWidth="1px" borderColor="border.default" onChange={() => toggle(row.id)}
              sx={{ '.chakra-checkbox__label': { flex: 1, ml: 3, minW: 0 } }}>
              <HStack spacing={3} w="full">
                <CategoryBadge category={it.category} kind={badgeKind(it.kind)} size={32} />
                <Box flex="1" minW={0}>
                  <Text fontSize="sm" fontWeight="600" noOfLines={1}>{row.name}</Text>
                  <Text fontSize="xs" color="text.muted">{row.perYear}</Text>
                </Box>
                <Text fontSize="sm" fontWeight="700" whiteSpace="nowrap">{row.perMonth}</Text>
              </HStack>
            </Checkbox>
          )
        })}
      </Box>
      <Tile py={3} mt={4} aria-live="polite">
        <HStack justify="space-between" align="baseline" flexWrap="wrap" columnGap={3}>
          <Text fontSize="sm" fontWeight="600">{parts.summary.label}</Text>
          <Text fontFamily="heading" fontWeight="700" fontSize="lg" color={textColor(parts.summary.tone)}>
            {parts.summary.amount}
          </Text>
        </HStack>
        <Text fontSize="xs" color="text.muted" textAlign="right">{parts.summary.sub}</Text>
      </Tile>
      <HStack spacing={2} justify="flex-end" mt={4}>
        <Button variant="ghost" onClick={close}>{t('common:actions.cancel')}</Button>
        <Button isDisabled={!parts.picked.length} onClick={() => { onAdd(parts.picked); close() }}>{parts.add}</Button>
      </HStack>
    </Panel>
  )
}
