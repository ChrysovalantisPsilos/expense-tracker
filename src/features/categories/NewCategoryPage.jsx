import { useSearchParams } from 'react-router-dom'
import { useToast } from '@chakra-ui/react'
import FormPage, { PageForm } from '../../shared/ui/FormPage.jsx'
import RingLoader from '../../shared/ui/RingLoader.jsx'
import useGoBack from '../../shared/ui/useGoBack.js'
import { useAsyncSubmit } from '../../shared/lib/useAsyncSubmit.js'
import { useAllCategories, createCategory } from '../../shared/lib/categories.js'
import { sameKindOthers } from './categoryMath.js'
import CategoryFields, { useCategoryDraft } from './CategoryFields.jsx'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

// /settings/categories/new?kind=expense|income — add a category: its name,
// icon and colour. (An existing one is edited on its own page, in the Edit
// panel.) Saving goes back to wherever the user came from, else Categories.
export default function NewCategoryPage() {
  const [params] = useSearchParams()
  const t = useT('categories')
  const kind = params.get('kind') === 'income' ? 'income' : 'expense'
  // The user's categories, for the duplicate-name rule.
  const { rows, loading } = useAllCategories()
  return (
    <FormPage eyebrow={t('newPage.eyebrow')} fallback="/settings/categories"
      title={t(`newPage.title.${kind}`)}>
      {loading ? <RingLoader /> : <NewCategoryForm key={kind} kind={kind} all={rows} />}
    </FormPage>
  )
}

function NewCategoryForm({ kind, all }) {
  const t = useT('categories')
  const toast = useToast()
  const back = useGoBack('/settings/categories')
  const draft = useCategoryDraft(null, sameKindOthers(all, { kind }))
  const { busy, run } = useAsyncSubmit()

  async function submit() {
    draft.setTouched(true)
    if (draft.nameError) return
    await run(async () => {
      await createCategory({ ...draft.values, kind })
      toast({ title: t('toasts.added', { name: draft.name.trim() }), status: 'success' })
      back()
    })
  }

  return (
    <PageForm onSubmit={submit} busy={busy} submitLabel={t('newPage.submit')}>
      <CategoryFields draft={draft} kind={kind} />
    </PageForm>
  )
}
