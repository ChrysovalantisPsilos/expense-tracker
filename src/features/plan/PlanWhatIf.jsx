import { useRef, useState } from 'react'
import {
  Box, Button, Checkbox, FormControl, FormLabel, HStack, IconButton, Input, InputGroup, InputRightElement, Link, SimpleGrid,
  Stack, Text,
} from '@chakra-ui/react'
import { ArrowRight, CircleAlert, Sparkle } from 'lucide-react'
import CategoryBadge from '../../shared/ui/CategoryBadge.jsx'
import SegmentedControl from '../../shared/ui/SegmentedControl.jsx'
import Panel from '../../shared/ui/kit/Panel.jsx'
import { InfoBox, InfoButton, useInfoToggle } from '../../shared/ui/InfoToggle.jsx'
import { BusyNote, RingSpinner } from '../../shared/ui/RingLoader.jsx'
import { minorToInput, toMinor } from '../../shared/lib/currency.js'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'
import { LINE_MAX } from '../../../supabase/functions/_shared/aiHelper.ts'
import SuggestedMark from '../ai/SuggestedMark.jsx'
import DemoAiNote from '../ai/DemoAiNote.jsx'
import { aiErrorKey } from '../ai/aiMath.js'
import { planWhatIf } from '../ai/ai.js'
import { NAME_MAX, savingsCategories } from './planMath.js'
import { applyWhatIf, editRow, rowReady, undoWhatIf, whatIfRows } from './whatIfMath.js'
import { itemName, whatIfLine } from './planText.js'
import { AmountField, FrequencySelect, newId } from './PlanEditors.jsx'
import { SCROLL_CLEAR, badgeKind, editorId, openerId } from './PlanParts.jsx'

// The key Plan.jsx's one open editor uses for this preview.
export const WHAT_IF_KEY = 'whatif'

// "✦ Type a what-if" (the optional AI helper, Settings → AI helpers): a line
// like "cancel Netflix, add a gym at €40 a month" → the proposed changes,
// each marked Suggested, listed in place under the input. Each can be unticked
// or edited; "Add to plan" makes the ticked ones ordinary plan edits (Undo
// takes exactly those back out). Nothing real changes: the plan is still a
// sandbox until its own Apply. The preview is the page's one open editor
// (`open`, `onOpen`, `onClose` from Plan.jsx).
export default function PlanWhatIf({ open, onOpen, onClose, plan, setPlan, items, rules, categories, todayISO }) {
  const t = useT('plan')
  const info = useInfoToggle()
  const inputRef = useRef(null)
  const [text, setText] = useState('')
  const [state, setState] = useState('idle') // idle | working | preview | added | error
  const [error, setError] = useState(null)   // { key, values }
  const [rows, setRows] = useState([])
  const [picked, setPicked] = useState(() => new Set())
  const [notFound, setNotFound] = useState([])
  const [editing, setEditing] = useState(null)
  const [added, setAdded] = useState(null)   // { count, undo: whatIfMath's `added` }
  const shown = state === 'preview' && open
  // Where a proposed new savings item goes (none: savings can't be added).
  const savingsCategoryId = savingsCategories(categories)[0]?.id ?? null

  async function ask() {
    if (!text.trim() || state === 'working') return
    setState('working')
    setAdded(null)
    try {
      const whatif = await planWhatIf(text.trim(), categories)
      const next = whatIfRows(whatif, items, savingsCategoryId)
      const missing = whatif?.notFound ?? []
      if (!next.length) {
        setError(missing.length
          ? { key: 'typeIt.notFound', values: { names: missing.join(', ') } }
          : { key: 'typeIt.unreadable' })
        setState('error')
        return
      }
      setRows(next)
      setPicked(new Set(next.map((r) => r.id)))
      setNotFound(missing)
      setEditing(null)
      setState('preview')
      onOpen()
    } catch (e) {
      setError({ key: aiErrorKey(e.code, 'plan:typeIt.unreadable') })
      setState('error')
    }
  }

  const ready = rows.filter((r) => picked.has(r.id) && rowReady(r))
  function addToPlan() {
    const res = applyWhatIf(plan, rows, picked, { rules, todayISO, newId, savingsCategoryId })
    setPlan(res.plan)
    setAdded({ count: ready.length, undo: res.added })
    setState('added')
    setText('')
    onClose()
  }
  function undo() {
    setPlan((p) => undoWhatIf(p, added.undo))
    setAdded(null)
    setState('idle')
  }
  function cancel() {
    onClose()
    setState('idle')
    inputRef.current?.focus()
  }
  const toggle = (id) => setPicked((s) => {
    const next = new Set(s)
    if (!next.delete(id)) next.add(id)
    return next
  })
  const edit = (id, patch) => setRows((list) => list.map((r) => (r.id === id ? editRow(r, patch) : r)))

  return (
    <Panel p={4} as="section" aria-label={t('typeIt.label')} data-plan-item="" sx={SCROLL_CLEAR}>
      <FormControl as="div">
        <HStack spacing={0.5} mb={2}>
          <FormLabel htmlFor="plan-type-it" mb={0} mr={0} display="inline-flex" alignItems="center" gap={1.5}>
            <Box as="span" color="accent.fg" display="inline-flex"><Sparkle size={15} fill="currentColor" aria-hidden /></Box>
            {t('typeIt.label')}
          </FormLabel>
          <InfoButton info={info} label={t('ai:settings.noteLabel')} />
        </HStack>
        <InputGroup>
          <Input ref={inputRef} id={openerId(WHAT_IF_KEY)} value={text} placeholder={t('typeIt.placeholder')} enterKeyHint="go"
            autoComplete="off" maxLength={LINE_MAX} pr="52px" isReadOnly={state === 'working'}
            aria-expanded={shown} aria-controls={shown ? editorId(WHAT_IF_KEY) : undefined}
            onChange={(e) => { setText(e.target.value); if (state === 'error') setState('idle') }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); ask() } }} />
          <InputRightElement w="48px" h="full">
            <IconButton size="sm" aria-label={t('typeIt.go')} icon={<ArrowRight size={16} />} isDisabled={!text.trim()}
              isLoading={state === 'working'} spinner={<RingSpinner />} onClick={ask} />
          </InputRightElement>
        </InputGroup>
        <InfoBox info={info}>{t('typeIt.more')}</InfoBox>
        <DemoAiNote mt={2} />
      </FormControl>
      {state === 'working' && <BusyNote mt={2}>{t('typeIt.working')}</BusyNote>}
      {state === 'error' && (
        <HStack role="alert" align="start" spacing={2} mt={2} fontSize="sm" color="status.warning">
          <Box pt="2px" flexShrink={0}><CircleAlert size={16} aria-hidden /></Box>
          <Text>{t(error.key, error.values)}</Text>
        </HStack>
      )}
      {state === 'added' && added && (
        <Text fontSize="sm" color="text.muted" mt={2} role="status">
          {t('typeIt.added', { count: added.count })}{' '}
          <Link as="button" type="button" color="accent.fg" fontWeight="600" py={2} onClick={undo}>{t('typeIt.undo')}</Link>
        </Text>
      )}
      {shown && (
        <Box id={editorId(WHAT_IF_KEY)} role="group" aria-label={t('typeIt.previewLabel')} mt={3}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); cancel() } }}>
          <Text fontSize="xs" color="text.muted" mb={1}>{t('typeIt.check')}</Text>
          <Box as="ul" listStyleType="none">
            {rows.map((row) => (
              <PreviewRow key={row.id} row={row} picked={picked.has(row.id)} onToggle={() => toggle(row.id)}
                editing={editing === row.id} onEdit={() => setEditing(editing === row.id ? null : row.id)}
                onChange={(patch) => edit(row.id, patch)} />
            ))}
          </Box>
          {notFound.length > 0 && (
            <Text fontSize="xs" color="text.muted" mt={2}>{t('typeIt.notFoundToo', { names: notFound.join(', ') })}</Text>
          )}
          <HStack spacing={2} justify="flex-end" mt={3}>
            <Button variant="ghost" onClick={cancel}>{t('common:actions.cancel')}</Button>
            <Button isDisabled={!ready.length} onClick={addToPlan}>
              {ready.length ? t('typeIt.addToPlan', { count: ready.length }) : t('typeIt.addNone')}
            </Button>
          </HStack>
        </Box>
      )}
    </Panel>
  )
}

// One proposal: ticked to go into the plan, its name with the Suggested mark
// until it's edited, what it does in a line, and Edit to change it in place.
function PreviewRow({ row, picked, onToggle, editing, onEdit, onChange }) {
  const t = useT('plan')
  const name = row.item ? itemName(row.item) : row.name
  return (
    <Box as="li" py={2} borderBottomWidth="1px" borderColor="border.default">
      <HStack spacing={3} align="start">
        <Checkbox size="lg" mt={1.5} isChecked={picked} onChange={onToggle} aria-label={t('typeIt.pick', { name })} />
        <Box pt={0.5} flexShrink={0} opacity={picked ? 1 : 0.5}>
          <CategoryBadge category={row.item?.category ?? null} kind={badgeKind(row.kind)} size={32} />
        </Box>
        <Box flex="1" minW={0} opacity={picked ? 1 : 0.6}>
          <HStack spacing={2} flexWrap="wrap" rowGap={0}>
            <Text fontSize="sm" fontWeight="600" noOfLines={1}>{name || t('typeIt.noName')}</Text>
            {!row.edited && <SuggestedMark />}
          </HStack>
          <Text fontSize="xs" color="text.muted">{whatIfLine(row, t)}</Text>
        </Box>
        <Button variant="link" size="sm" minH="44px" color="accent.fg" flexShrink={0} onClick={onEdit}
          aria-expanded={editing} aria-label={t('typeIt.editLabel', { name })}>
          {editing ? t('edit.done') : t('typeIt.edit')}
        </Button>
      </HStack>
      {editing && <RowEditor row={row} onChange={onChange} />}
    </Box>
  )
}

// A proposal's fields, in place: keep-and-change or cancel for a payment
// that's there, the name for a new one; the amount and how often.
function RowEditor({ row, onChange }) {
  const t = useT('plan')
  const fields = row.after ?? row.kept ?? row.before
  const [text, setText] = useState(() => minorToInput(fields.amount_minor, fields.currency))
  const cancelled = row.type === 'cancel'
  function onText(v) {
    setText(v)
    const minor = toMinor(v || '0', fields.currency)
    if (minor > 0) onChange({ amount_minor: minor })
  }
  return (
    <Stack spacing={3} mt={2} ml={{ base: 0, sm: '76px' }} p={3} borderWidth="1px" borderColor="border.default"
      borderRadius="xl" bg="bg.surface">
      {row.type === 'add' ? (
        <FormControl>
          <FormLabel htmlFor={`plan-type-it-name-${row.id}`}>{t('add.name')}</FormLabel>
          <Input id={`plan-type-it-name-${row.id}`} value={row.name} maxLength={NAME_MAX}
            onChange={(e) => onChange({ name: e.target.value })} />
        </FormControl>
      ) : (
        <SegmentedControl label={t('edit.inPlan')} size="sm" isFitted value={cancelled ? 'cancel' : 'change'}
          onChange={(v) => onChange({ cancel: v === 'cancel' })}
          options={[['change', t('typeIt.changeIt')], ['cancel', t(row.kind === 'expense' ? 'edit.cancel' : 'edit.stop')]]} />
      )}
      <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={3} alignItems="start">
        <AmountField id={`plan-type-it-amount-${row.id}`} label={t('edit.amount')} text={text} onText={onText}
          currency={fields.currency} addon={fields.currency} isDisabled={cancelled} />
        <FrequencySelect id={`plan-type-it-frequency-${row.id}`} fields={fields} isDisabled={cancelled}
          onChange={(f) => onChange(f)} />
      </SimpleGrid>
    </Stack>
  )
}
