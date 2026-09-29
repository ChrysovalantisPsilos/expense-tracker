import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Box, Button, FormControl, FormHelperText, FormLabel, Select, Stack, Tag, Text, useToast,
} from '@chakra-ui/react'
import { Archive, ArchiveRestore, Pencil, Plus, Tags, Trash2 } from 'lucide-react'
import SettingsSubPage from '../../shared/ui/SettingsSubPage.jsx'
import Panel from '../../shared/ui/kit/Panel.jsx'
import ItemRow from '../../shared/ui/kit/ItemRow.jsx'
import CategoryBadge from '../../shared/ui/CategoryBadge.jsx'
import SegmentedControl from '../../shared/ui/SegmentedControl.jsx'
import QueryError from '../../shared/ui/QueryError.jsx'
import { useAsyncSubmit } from '../../shared/lib/useAsyncSubmit.js'
import {
  useAllCategories, updateCategory, countCategoryUse, deleteCategory,
} from '../../shared/lib/categories.js'
import { isNewCategory, moveTargets, sortCategories } from './categoryMath.js'
import { categoryPath } from '../../shared/lib/categoryLinks.js'
import { userMessage } from '../../shared/lib/errors.js'
import RingLoader, { BusyNote } from '../../shared/ui/RingLoader.jsx'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'
import { categoryDisplayName } from '../../shared/lib/categoryName.js'
import ConfirmDialog from '../../shared/ui/ConfirmDialog.jsx'

// The Expenses / Income switch (labels: kinds.<kind>).
const KINDS = ['expense', 'income']

// Settings → Categories: add, rename, re-icon, recolour, archive and delete
// expense and income categories. Archived ones keep their past entries but
// leave the pickers. A row opens the category's page (its entries and budget);
// Edit opens it on its Edit panel, and Add opens the new-category page.
export default function Categories() {
  const t = useT('categories')
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
      toast({ title: t(c.is_archived ? 'toasts.unarchived' : 'toasts.archived', { name: categoryDisplayName(c) }), status: 'success' })
    } catch (e) {
      console.error('[categories] archive failed:', e)
      toast({ title: userMessage(e, t('toasts.notUpdated')), status: 'error' })
    }
  }

  return (
    <SettingsSubPage title={t('list.title')} description={t('list.description')}>
      <Panel icon={Tags} title={t('list.yours')} action={
        <Button size="sm" leftIcon={<Plus size={16} />}
          onClick={() => navigate(`/settings/categories/new?kind=${kind}`)}>{t('actions.add')}</Button>
      }>
        <SegmentedControl label={t('list.typeLabel')} options={KINDS.map((k) => [k, t(`kinds.${k}`)])} value={kind} onChange={setKind} mb={3}
          alignSelf="start" w="fit-content" />
        {error ? <QueryError error={error} onRetry={reload} what={t('list.what')} /> : loading ? (
          <RingLoader />
        ) : list.length === 0 ? (
          <Text color="text.muted" fontSize="sm">{t(`list.empty.${kind}`)}</Text>
        ) : (
          <Stack spacing={0} role="list" aria-label={t(`list.listLabel.${kind}`)}>
            {list.map((c) => (
              <Box key={c.id} role="listitem">
                <ItemRow media={<CategoryBadge category={c} kind={c.kind} size={32} />}
                  title={isNewCategory(c) ? (
                    <>{categoryDisplayName(c)}{' '}<Tag size="sm" colorScheme="green" borderRadius="full" verticalAlign="middle">{t('list.new')}</Tag></>
                  ) : categoryDisplayName(c)}
                  meta={c.is_archived ? t('list.archived') : c.is_savings ? t('list.savings') : undefined}
                  dimmed={c.is_archived}
                  onClick={() => navigate(categoryPath(c.id))} chevron
                  actionSlots={3} actions={[
                    { label: t('list.editOne', { name: categoryDisplayName(c) }), icon: Pencil, onClick: () => navigate(categoryPath(c.id), { state: { edit: true } }) },
                    c.is_archived
                      ? { label: t('list.unarchiveOne', { name: categoryDisplayName(c) }), icon: ArchiveRestore, onClick: () => toggleArchive(c) }
                      : { label: t('list.archiveOne', { name: categoryDisplayName(c) }), icon: Archive, onClick: () => toggleArchive(c) },
                    { label: t('list.deleteOne', { name: categoryDisplayName(c) }), icon: Trash2, danger: true, onClick: () => setDeleting(c) },
                  ]} />
              </Box>
            ))}
          </Stack>
        )}
      </Panel>

      <DeleteCategoryModal key={deleting?.id ?? 'none'} category={deleting} all={rows}
        onClose={() => setDeleting(null)} onSaved={reload} />
    </SettingsSubPage>
  )
}

// Delete, first choosing where the category's entries go.
function DeleteCategoryModal({ category, all, onClose, onSaved }) {
  const t = useT('categories')
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
        title: t('toasts.deleted', { name: categoryDisplayName(category) }),
        description: moved > 0 && target ? t('toasts.moved', { count: moved, target: categoryDisplayName(target) }) : undefined,
        status: 'success',
      })
      onSaved?.(); onClose()
    })
  }

  return (
    <ConfirmDialog isOpen={!!category} onClose={onClose} onConfirm={confirm} busy={busy} disabled={count == null} danger
      title={t('deleteDialog.title', { name: categoryDisplayName(category) })} confirmLabel={t('common:actions.delete')}>
      <Stack spacing={4}>
        {count == null ? (
          <BusyNote>{t('deleteDialog.checking')}</BusyNote>
        ) : count === 0 ? (
          <Text color="text.muted">{t('deleteDialog.unused')}</Text>
        ) : (
          <FormControl>
            <FormLabel>
              {Number.isNaN(count) ? t('deleteDialog.moveTo') : t('deleteDialog.moveCount', { count })}
            </FormLabel>
            <Select value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
              <option value="">{t('deleteDialog.leave')}</option>
              {targets.map((c) => <option key={c.id} value={c.id}>{categoryDisplayName(c)}</option>)}
            </Select>
            <FormHelperText>{t('deleteDialog.movesToo')}</FormHelperText>
          </FormControl>
        )}
        <Text color="text.muted" fontSize="sm">{t('deleteDialog.budgetsGo')}</Text>
      </Stack>
    </ConfirmDialog>
  )
}
