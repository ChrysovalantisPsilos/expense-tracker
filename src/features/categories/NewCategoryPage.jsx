import { useSearchParams } from 'react-router-dom'
import { useToast } from '@chakra-ui/react'
import FormPage, { PageForm } from '../../shared/ui/FormPage.jsx'
import RingLoader from '../../shared/ui/RingLoader.jsx'
import useGoBack from '../../shared/ui/useGoBack.js'
import { useAsyncSubmit } from '../../shared/lib/useAsyncSubmit.js'
import { useAllCategories, createCategory } from './categories.js'
import { sameKindOthers } from './categoryMath.js'
import CategoryFields, { useCategoryDraft } from './CategoryFields.jsx'

// /settings/categories/new?kind=expense|income — add a category: its name,
// icon and colour. (An existing one is edited on its own page, in the Edit
// panel.) Saving goes back to wherever the user came from, else Categories.
export default function NewCategoryPage() {
  const [params] = useSearchParams()
  const kind = params.get('kind') === 'income' ? 'income' : 'expense'
  // The user's categories, for the duplicate-name rule.
  const { rows, loading } = useAllCategories()
  return (
    <FormPage eyebrow="Categories" fallback="/settings/categories"
      title={`New ${kind} category`}>
      {loading ? <RingLoader /> : <NewCategoryForm key={kind} kind={kind} all={rows} />}
    </FormPage>
  )
}

function NewCategoryForm({ kind, all }) {
  const toast = useToast()
  const back = useGoBack('/settings/categories')
  const draft = useCategoryDraft(null, sameKindOthers(all, { kind }))
  const { busy, run } = useAsyncSubmit()

  async function submit() {
    draft.setTouched(true)
    if (draft.nameError) return
    await run(async () => {
      await createCategory({ ...draft.values, kind })
      toast({ title: `${draft.name.trim()} added`, status: 'success' })
      back()
    })
  }

  return (
    <PageForm onSubmit={submit} busy={busy} submitLabel="Add category">
      <CategoryFields draft={draft} kind={kind} />
    </PageForm>
  )
}
