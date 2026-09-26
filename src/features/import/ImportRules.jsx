import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box, Button, FormControl, FormErrorMessage, FormHelperText, FormLabel, Input, InputGroup,
  InputLeftElement, Select, Stack, Text, useToast,
} from '@chakra-ui/react'
import { Pencil, Search, Trash2, UploadCloud, Wand2 } from 'lucide-react'
import SettingsPage from '../settings/SettingsPage.jsx'
import Panel from '../../shared/ui/kit/Panel.jsx'
import ItemRow from '../../shared/ui/kit/ItemRow.jsx'
import CategoryBadge from '../../shared/ui/CategoryBadge.jsx'
import SegmentedControl from '../../shared/ui/SegmentedControl.jsx'
import EmptyState from '../../shared/ui/EmptyState.jsx'
import FormModal from '../../shared/ui/FormModal.jsx'
import QueryError from '../../shared/ui/QueryError.jsx'
import RingLoader from '../../shared/ui/RingLoader.jsx'
import { useAsyncSubmit } from '../../shared/lib/useAsyncSubmit.js'
import { shortDate } from '../../shared/lib/dates.js'
import { useAllCategories } from '../categories/categories.js'
import { useImportRules, updateRule, deleteRule } from './importRules.js'
import {
  PATTERN_MAX, RULE_FILTERS, cleanPattern, directionLabel, filterRules, patternProblem, ruleRows, ruleTargets,
} from './importRulesMath.js'
import Paginator from '../../shared/ui/Paginator.jsx'
import { usePaged } from '../../shared/ui/usePaged.js'

const PAGE_SIZE = 15

// Settings › Import rules: the "description contains → category" rules the
// import wizard learns when the user picks categories for new merchants.
// Each shows its text, its category (icon and colour), which way the money
// goes and when it was added; search and a direction filter narrow the list,
// a row opens its editor (text and category) and Delete asks first. Live.
export default function ImportRules() {
  const navigate = useNavigate()
  const rules = useImportRules()
  const categories = useAllCategories()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)

  const rows = useMemo(() => ruleRows(rules.rows, categories.rows), [rules.rows, categories.rows])
  const shown = useMemo(() => filterRules(rows, { query, filter }), [rows, query, filter])
  // Long rule lists page like the other lists; a new search or filter starts at page 1.
  const paged = usePaged(shown, PAGE_SIZE, `${query}|${filter}`)
  const error = rules.error ?? categories.error
  const reload = () => { rules.reload(); categories.reload() }

  let body
  if (error) body = <QueryError error={error} onRetry={reload} what="your import rules" />
  else if (rules.loading || categories.loading) body = <RingLoader />
  else if (rows.length === 0) {
    body = (
      <EmptyState title="No import rules yet"
        text="Rules are made when you import a bank statement and pick categories for new merchants. Next time, their rows are sorted automatically."
        actions={<Button leftIcon={<UploadCloud size={16} />} onClick={() => navigate('/import')}>Import a statement</Button>} />
    )
  } else {
    body = (
      <Stack spacing={3}>
        <InputGroup size="sm">
          <InputLeftElement pointerEvents="none" color="text.muted"><Search size={16} /></InputLeftElement>
          <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search text or category" aria-label="Search import rules" borderRadius="lg" />
        </InputGroup>
        <SegmentedControl label="Direction" options={RULE_FILTERS} value={filter} onChange={setFilter}
          alignSelf="start" w="fit-content" />
        {shown.length === 0 ? (
          <Text color="text.muted" fontSize="sm">No rules match.</Text>
        ) : (
          <Stack spacing={0} role="list" aria-label="Import rules">
            {paged.pageItems.map((r) => (
              <Box key={r.id} role="listitem">
                <ItemRow media={<CategoryBadge category={r.category} kind={r.kind} size={32} />}
                  title={r.pattern}
                  meta={[
                    r.category?.name ?? 'Unknown category',
                    r.kind && directionLabel(r.kind),
                    r.addedOn && `Added ${shortDate(r.addedOn)}`,
                  ].filter(Boolean).join(' · ')}
                  onClick={() => setEditing(r)}
                  actionSlots={2} actions={[
                    { label: `Edit ${r.pattern}`, icon: Pencil, onClick: () => setEditing(r) },
                    { label: `Delete ${r.pattern}`, icon: Trash2, danger: true, onClick: () => setDeleting(r) },
                  ]} />
              </Box>
            ))}
          </Stack>
        )}
        <Paginator page={paged.page} count={paged.count} onPage={paged.setPage} />
      </Stack>
    )
  }

  return (
    <SettingsPage title="Import rules"
      description="When an imported row’s description contains a rule’s text, it gets the rule’s category.">
      <Panel icon={Wand2} title="Your rules" subtitle={rows.length ? `${rows.length} ${rows.length === 1 ? 'rule' : 'rules'}` : undefined}>
        {body}
      </Panel>
      <EditRuleModal key={editing?.id ?? 'none'} rule={editing} rules={rows} categories={categories.rows}
        onClose={() => setEditing(null)} onSaved={rules.reload} />
      <DeleteRuleModal rule={deleting} onClose={() => setDeleting(null)} onDone={rules.reload} />
    </SettingsPage>
  )
}

// Change a rule's text and category.
function EditRuleModal({ rule, rules, categories, onClose, onSaved }) {
  const toast = useToast()
  const textRef = useRef(null)
  const [pattern, setPattern] = useState(rule?.pattern ?? '')
  const [categoryId, setCategoryId] = useState(rule?.category_id ?? '')
  const [touched, setTouched] = useState(false)
  const { busy, run } = useAsyncSubmit()
  const problem = patternProblem(pattern, rules, rule?.id)
  const groups = ruleTargets(categories, rule?.category_id)

  async function save() {
    setTouched(true)
    if (problem || !categoryId) return
    await run(async () => {
      await updateRule(rule.id, { pattern, category_id: categoryId })
      toast({ title: 'Rule saved', status: 'success' })
      onSaved?.(); onClose()
    })
  }

  return (
    <FormModal isOpen={!!rule} onClose={onClose} title="Edit rule" onSubmit={save} busy={busy}
      initialFocusRef={textRef} noValidate>
      <Stack spacing={4}>
        <FormControl isInvalid={touched && !!problem}>
          <FormLabel>Description contains</FormLabel>
          <Input ref={textRef} value={pattern} maxLength={PATTERN_MAX} autoComplete="off"
            onChange={(e) => setPattern(e.target.value)} onBlur={() => setTouched(true)} />
          {touched && problem
            ? <FormErrorMessage>{problem}</FormErrorMessage>
            : <FormHelperText>Upper or lower case doesn’t matter.</FormHelperText>}
        </FormControl>
        <FormControl>
          <FormLabel>Category</FormLabel>
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {groups.map((g) => (
              <optgroup key={g.kind} label={g.label}>
                {g.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </optgroup>
            ))}
          </Select>
          <FormHelperText>A money-out category files payments; a money-in one, money you receive.</FormHelperText>
        </FormControl>
        {cleanPattern(pattern) !== rule?.pattern && (
          <Text fontSize="xs" color="text.muted">
            Only future imports use the new text; entries already imported keep their category.
          </Text>
        )}
      </Stack>
    </FormModal>
  )
}

// Delete, after asking.
function DeleteRuleModal({ rule, onClose, onDone }) {
  const toast = useToast()
  const { busy, run } = useAsyncSubmit()
  async function confirm() {
    await run(async () => {
      await deleteRule(rule.id)
      toast({ title: 'Rule deleted', status: 'success' })
      onDone?.(); onClose()
    })
  }
  return (
    <FormModal isOpen={!!rule} onClose={onClose} title={`Delete “${rule?.pattern ?? ''}”?`} onSubmit={confirm}
      busy={busy} submitLabel="Delete" submitProps={{ colorScheme: 'red' }}>
      <Text color="text.muted">
        Future imports won’t sort these rows automatically any more. Entries already imported keep their category.
      </Text>
    </FormModal>
  )
}
