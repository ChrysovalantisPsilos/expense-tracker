import { useEffect, useState } from 'react'
import {
  Box, Button, Center, FormControl, FormErrorMessage, FormHelperText, FormLabel, HStack,
  IconButton, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, ModalOverlay,
  Select, SimpleGrid, Spinner, Stack, Text, Tooltip, useToast,
} from '@chakra-ui/react'
import { Archive, ArchiveRestore, Check, Pencil, Plus, Tags, Trash2 } from 'lucide-react'
import SettingsPage from '../settings/SettingsPage.jsx'
import Panel from '../../shared/ui/kit/Panel.jsx'
import ItemRow from '../../shared/ui/kit/ItemRow.jsx'
import CategoryBadge from '../../shared/ui/CategoryBadge.jsx'
import SegmentedControl from '../../shared/ui/SegmentedControl.jsx'
import QueryError from '../../shared/ui/QueryError.jsx'
import { categoryIcon } from '../../shared/lib/icons.jsx'
import { CATEGORY_COLORS, CATEGORY_COLOR_KEYS, CATEGORY_ICON_KEYS } from '../../shared/lib/categoryStyle.js'
import { useAsyncSubmit } from '../../shared/lib/useAsyncSubmit.js'
import {
  useAllCategories, createCategory, updateCategory, countCategoryUse, deleteCategory,
} from './categories.js'
import { CATEGORY_NAME_MAX, categoryNameError, moveTargets, sortCategories } from './categoryMath.js'

const KINDS = [['expense', 'Expenses'], ['income', 'Income']]

// Settings → Categories: add, rename, re-icon, recolour, archive and delete
// expense and income categories. Archived ones keep their past entries but
// leave the pickers.
export default function Categories() {
  const toast = useToast()
  const { rows, loading, error, reload } = useAllCategories()
  const [kind, setKind] = useState('expense')
  const [editing, setEditing] = useState(null) // { kind } for new, a row to edit
  const [deleting, setDeleting] = useState(null)
  const list = sortCategories(rows, kind)

  async function toggleArchive(c) {
    try {
      await updateCategory(c.id, { is_archived: !c.is_archived })
      reload()
      toast({ title: c.is_archived ? `${c.name} is back in your pickers` : `${c.name} archived`, status: 'success' })
    } catch (e) { toast({ title: e.message, status: 'error' }) }
  }

  return (
    <SettingsPage title="Categories"
      description="Add your own, rename them, pick an icon and colour, or archive the ones you no longer use. Archived categories stay on past entries.">
      <Panel icon={Tags} title="Your categories" action={
        <Button size="sm" leftIcon={<Plus size={16} />} onClick={() => setEditing({ kind })}>Add</Button>
      }>
        <SegmentedControl label="Category type" options={KINDS} value={kind} onChange={setKind} mb={3}
          alignSelf="start" w="fit-content" />
        {error ? <QueryError error={error} onRetry={reload} what="categories" /> : loading ? (
          <Center py={8}><Spinner color="brand.500" /></Center>
        ) : list.length === 0 ? (
          <Text color="text.muted" fontSize="sm">No {kind} categories yet — add one.</Text>
        ) : (
          <Stack spacing={0} role="list" aria-label={`${kind === 'income' ? 'Income' : 'Expense'} categories`}>
            {list.map((c) => (
              <Box key={c.id} role="listitem">
                <ItemRow media={<CategoryBadge category={c} kind={c.kind} size={32} />}
                  title={c.name} meta={c.is_archived ? 'Archived' : undefined} dimmed={c.is_archived}
                  actionSlots={3} actions={[
                    { label: `Edit ${c.name}`, icon: Pencil, onClick: () => setEditing(c) },
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

      <CategoryModal key={editing?.id ?? `new-${editing?.kind}`} category={editing} all={rows}
        onClose={() => setEditing(null)} onSaved={reload} />
      <DeleteCategoryModal key={deleting?.id ?? 'none'} category={deleting} all={rows}
        onClose={() => setDeleting(null)} onSaved={reload} />
    </SettingsPage>
  )
}

// The icon key the badge currently shows for `c` (a legacy/unknown stored
// icon falls back to its name heuristic's key, so saving keeps its look).
function currentIconKey(c) {
  if (CATEGORY_ICON_KEYS.includes(c?.icon)) return c.icon
  const shown = categoryIcon(c ?? '')
  return CATEGORY_ICON_KEYS.find((k) => categoryIcon({ icon: k }) === shown) ?? 'other'
}

// Add (category = { kind }) or edit (category = a row) one category.
function CategoryModal({ category, all, onClose, onSaved }) {
  const toast = useToast()
  const isEdit = !!category?.id
  const [name, setName] = useState(category?.name ?? '')
  const [icon, setIcon] = useState(isEdit ? currentIconKey(category) : 'other')
  const [color, setColor] = useState(category?.color ?? null)
  const [touched, setTouched] = useState(false)
  const { busy, run } = useAsyncSubmit()
  const others = (all ?? []).filter((c) => c.kind === category?.kind && c.id !== category?.id)
  const nameError = categoryNameError(name, others)

  async function submit(e) {
    e.preventDefault()
    setTouched(true)
    if (nameError) return
    await run(async () => {
      if (isEdit) await updateCategory(category.id, { name, icon, color })
      else await createCategory({ name, kind: category.kind, icon, color })
      toast({ title: isEdit ? 'Category saved' : `${name.trim()} added`, status: 'success' })
      onSaved?.(); onClose()
    })
  }

  const preview = { name, icon, color }
  return (
    <Modal isOpen={!!category} onClose={onClose} isCentered scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent as="form" onSubmit={submit} mx={4}>
        <ModalHeader>
          {isEdit ? 'Edit category' : `New ${category?.kind === 'income' ? 'income' : 'expense'} category`}
        </ModalHeader>
        <ModalBody>
          <Stack spacing={5}>
            <HStack spacing={3} align="start">
              <Box pt={8}><CategoryBadge category={preview} kind={category?.kind} size={40} /></Box>
              <FormControl isRequired isInvalid={touched && !!nameError}>
                <FormLabel>Name</FormLabel>
                <Input value={name} maxLength={CATEGORY_NAME_MAX + 10}
                  onChange={(e) => setName(e.target.value)} onBlur={() => name && setTouched(true)}
                  placeholder={category?.kind === 'income' ? 'Freelance' : 'Pets'} />
                <FormErrorMessage>{nameError}</FormErrorMessage>
              </FormControl>
            </HStack>

            <FormControl as="fieldset">
              <FormLabel as="legend">Icon</FormLabel>
              <SimpleGrid columns={8} spacing={1.5} role="radiogroup" aria-label="Icon">
                {CATEGORY_ICON_KEYS.map((k) => {
                  const Icon = categoryIcon({ icon: k })
                  const on = icon === k
                  return (
                    <IconButton key={k} size="sm" role="radio" aria-checked={on} aria-label={k}
                      variant={on ? 'solid' : 'ghost'} colorScheme={on ? 'brand' : 'gray'}
                      icon={<Icon size={16} />} onClick={() => setIcon(k)} />
                  )
                })}
              </SimpleGrid>
            </FormControl>

            <FormControl as="fieldset">
              <FormLabel as="legend">Colour</FormLabel>
              <HStack spacing={2} flexWrap="wrap" role="radiogroup" aria-label="Colour">
                <Swatch label="Default" on={!color} onClick={() => setColor(null)} />
                {CATEGORY_COLOR_KEYS.map((k) => (
                  <Swatch key={k} label={k} hex={CATEGORY_COLORS[k]} on={color === k}
                    onClick={() => setColor(k)} />
                ))}
              </HStack>
              <FormHelperText>Used for the category’s icon everywhere in the app.</FormHelperText>
            </FormControl>
          </Stack>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={busy}>{isEdit ? 'Save' : 'Add category'}</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}

function Swatch({ label, hex, on, onClick }) {
  return (
    <Tooltip label={label} openDelay={400}>
      <Box as="button" type="button" role="radio" aria-checked={on} aria-label={label} onClick={onClick}
        boxSize="32px" borderRadius="full" bg={hex ?? 'bg.subtle'} borderWidth="2px"
        borderColor={on ? 'text.primary' : 'border.default'} display="grid" placeItems="center"
        color={hex ? 'white' : 'text.muted'} _focusVisible={{ boxShadow: 'outline' }}>
        {on && <Check size={16} />}
      </Box>
    </Tooltip>
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
              <HStack color="text.muted" fontSize="sm"><Spinner size="xs" /><Text>Checking its entries…</Text></HStack>
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
