import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Box, Button, FormControl, FormHelperText, FormLabel,
  Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, ModalOverlay,
  Select, Stack, Tag, Text, useToast,
} from '@chakra-ui/react'
import { Archive, ArchiveRestore, Pencil, Plus, Tags, Trash2 } from 'lucide-react'
import SettingsPage from '../settings/SettingsPage.jsx'
import Panel from '../../shared/ui/kit/Panel.jsx'
import ItemRow from '../../shared/ui/kit/ItemRow.jsx'
import CategoryBadge from '../../shared/ui/CategoryBadge.jsx'
import SegmentedControl from '../../shared/ui/SegmentedControl.jsx'
import QueryError from '../../shared/ui/QueryError.jsx'
import { useAsyncSubmit } from '../../shared/lib/useAsyncSubmit.js'
import { useAllCategories, updateCategory, countCategoryUse, deleteCategory } from './categories.js'
import { isNewCategory, moveTargets, sortCategories } from './categoryMath.js'
import { categoryPath } from './categoryLinks.js'
import { userMessage } from '../../shared/lib/errors.js'
import RingLoader, { BusyNote } from '../../shared/ui/RingLoader.jsx'

const KINDS = [['expense', 'Expenses'], ['income', 'Income']]

// Settings → Categories: add, rename, re-icon, recolour, archive and delete
// expense and income categories. Archived ones keep their past entries but
// leave the pickers. A row opens the category's page (its entries and budget);
// Edit opens it on its Edit panel, and Add opens the new-category page.
export default function Categories() {
  const toast = useToast()
  const navigate = useNavigate()
  const { rows, loading, error, reload } = useAllCategories()
  // The Expenses / Income switch is kept in the address, so coming back from
  // adding a category lands on its kind.
  const [params, setParams] = useSearchParams()
  const kind = params.get('kind') === 'income' ? 'income' : 'expense'
  const setKind = (k) => setParams(k === 'income' ? { kind: k } : {}, { replace: true })
  const [deleting, setDeleting] = useState(null)
  const list = sortCategories(rows, kind)

  async function toggleArchive(c) {
    try {
      await updateCategory(c.id, { is_archived: !c.is_archived })
      reload()
      toast({ title: c.is_archived ? `${c.name} is back in your pickers` : `${c.name} archived`, status: 'success' })
    } catch (e) {
      console.error('[categories] archive failed:', e)
      toast({ title: userMessage(e, 'Couldn’t update the category. Please try again.'), status: 'error' })
    }
  }

  return (
    <SettingsPage title="Categories"
      description="Add your own, rename them, pick an icon and colour, or archive the ones you no longer use. Archived categories stay on past entries.">
      <Panel icon={Tags} title="Your categories" action={
        <Button size="sm" leftIcon={<Plus size={16} />}
          onClick={() => navigate(`/settings/categories/new?kind=${kind}`)}>Add</Button>
      }>
        <SegmentedControl label="Category type" options={KINDS} value={kind} onChange={setKind} mb={3}
          alignSelf="start" w="fit-content" />
        {error ? <QueryError error={error} onRetry={reload} what="categories" /> : loading ? (
          <RingLoader />
        ) : list.length === 0 ? (
          <Text color="text.muted" fontSize="sm">No {kind} categories yet — add one.</Text>
        ) : (
          <Stack spacing={0} role="list" aria-label={`${kind === 'income' ? 'Income' : 'Expense'} categories`}>
            {list.map((c) => (
              <Box key={c.id} role="listitem">
                <ItemRow media={<CategoryBadge category={c} kind={c.kind} size={32} />}
                  title={isNewCategory(c) ? (
                    <>{c.name}{' '}<Tag size="sm" colorScheme="green" borderRadius="full" verticalAlign="middle">New</Tag></>
                  ) : c.name}
                  meta={c.is_archived ? 'Archived' : c.is_savings ? 'Savings, not income' : undefined}
                  dimmed={c.is_archived}
                  onClick={() => navigate(categoryPath(c.id))} chevron
                  actionSlots={3} actions={[
                    { label: `Edit ${c.name}`, icon: Pencil, onClick: () => navigate(categoryPath(c.id), { state: { edit: true } }) },
                    c.is_archived
                      ? { label: `Unarchive ${c.name}`, icon: ArchiveRestore, onClick: () => toggleArchive(c) }
                      : { label: `Archive ${c.name}`, icon: Archive, onClick: () => toggleArchive(c) },
                    { label: `Delete ${c.name}`, icon: Trash2, danger: true, onClick: () => setDeleting(c) },
                  ]} />
              </Box>
            ))}
          </Stack>
        )}
      </Panel>

      <DeleteCategoryModal key={deleting?.id ?? 'none'} category={deleting} all={rows}
        onClose={() => setDeleting(null)} onSaved={reload} />
    </SettingsPage>
  )
}

// Delete, first choosing where the category's entries go.
function DeleteCategoryModal({ category, all, onClose, onSaved }) {
  const toast = useToast()
  const [count, setCount] = useState(null)
  const targets = moveTargets(all, category)
  const [moveTo, setMoveTo] = useState('')
  const { busy, run } = useAsyncSubmit()

  useEffect(() => {
    if (!category) return undefined
    let live = true
    // A failed count still lets the user choose (count NaN = unknown).
    countCategoryUse(category.id).then((n) => { if (live) setCount(n) }).catch(() => { if (live) setCount(NaN) })
    return () => { live = false }
  }, [category])

  async function confirm() {
    await run(async () => {
      const moved = await deleteCategory(category.id, moveTo || null)
      const target = targets.find((c) => c.id === moveTo)
      toast({
        title: `${category.name} deleted`,
        description: moved > 0 && target ? `${moved} ${moved === 1 ? 'entry' : 'entries'} moved to ${target.name}.` : undefined,
        status: 'success',
      })
      onSaved?.(); onClose()
    })
  }

  return (
    <Modal isOpen={!!category} onClose={onClose} isCentered>
      <ModalOverlay />
      <ModalContent mx={4}>
        <ModalHeader>Delete “{category?.name}”?</ModalHeader>
        <ModalBody>
          <Stack spacing={4}>
            {count == null ? (
              <BusyNote>Checking its entries…</BusyNote>
            ) : count === 0 ? (
              <Text color="text.muted">No entries use this category.</Text>
            ) : (
              <FormControl>
                <FormLabel>
                  {Number.isNaN(count) ? 'Move its entries to' : `Move its ${count} ${count === 1 ? 'entry' : 'entries'} to`}
                </FormLabel>
                <Select value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                  <option value="">Leave them uncategorised</option>
                  {targets.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
                <FormHelperText>Recurring entries and import rules move too.</FormHelperText>
              </FormControl>
            )}
            <Text color="text.muted" fontSize="sm">
              Its budgets are removed. To keep it on past entries instead, archive it.
            </Text>
          </Stack>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button colorScheme="red" isLoading={busy} isDisabled={count == null} onClick={confirm}>Delete</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
