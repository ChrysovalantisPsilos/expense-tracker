import { useState } from 'react'
import { FormControl, FormLabel, Input, Stack, Text, useToast } from '@chakra-ui/react'
import { useAsyncSubmit } from '../../shared/lib/useAsyncSubmit.js'
import Panel from '../../shared/ui/kit/Panel.jsx'
import { PageForm } from '../../shared/ui/FormPage.jsx'
import useGoBack from '../../shared/ui/useGoBack.js'
import { renameGroup, uploadGroupImage } from './groups.js'
import CoverPicker, { NO_COVER } from './CoverPicker.jsx'
import { coverFile } from './coverImage.js'
import GroupFormPage from './GroupFormPage.jsx'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

// /groups/:id/edit — the owner renames the group and changes its picture (a
// photo, or an emoji on a colour; RLS and the storage policy enforce
// owner-only).
export default function EditGroupPage() {
  const t = useT('groups')
  return (
    <GroupFormPage title={t('edit.title')}>
      {(ctx) => (ctx.isOwner ? <RenameForm {...ctx} /> : (
        <Panel><Text color="text.muted">{t('edit.onlyOwner')}</Text></Panel>
      ))}
    </GroupFormPage>
  )
}

function RenameForm({ group, groupPath }) {
  const toast = useToast()
  const t = useT('groups')
  const back = useGoBack(groupPath)
  const [name, setName] = useState(group.name)
  const [cover, setCover] = useState(NO_COVER)
  const { busy, run } = useAsyncSubmit()

  async function submit() {
    if (!name.trim()) return
    await run(async () => {
      if (name.trim() !== group.name) {
        await renameGroup(group.id, name.trim())
        toast({ title: t('edit.renamed'), status: 'success' })
      }
      const file = await coverFile(cover)
      if (file) {
        await uploadGroupImage(group.id, file)
        toast({ title: t('header.photoUpdated'), status: 'success' })
      }
      back()
    }, { errorTitle: cover.kind === 'none' ? undefined : t('header.photoFailed') })
  }

  return (
    <PageForm onSubmit={submit} busy={busy}>
      <Stack spacing={5}>
        <FormControl>
          <FormLabel>{t('cover.title')}</FormLabel>
          <CoverPicker value={cover} onChange={setCover} current={group.image_url} colourKey={group.id} />
        </FormControl>
        <FormControl isRequired>
          <FormLabel>{t('edit.name')}</FormLabel>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </FormControl>
      </Stack>
    </PageForm>
  )
}
