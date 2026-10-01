import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FormControl, FormLabel, Input, Stack, useToast } from '@chakra-ui/react'
import { useProfile } from '../../shared/lib/ProfileProvider.jsx'
import { useAsyncSubmit } from '../../shared/lib/useAsyncSubmit.js'
import FormPage, { PageForm } from '../../shared/ui/FormPage.jsx'
import RingLoader from '../../shared/ui/RingLoader.jsx'
import { createGroup, uploadGroupImage } from './groups.js'
import CoverPicker, { NO_COVER } from './CoverPicker.jsx'
import { coverFile } from './coverImage.js'
import { userMessage } from '../../shared/lib/errors.js'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'
import CurrencySelect from '../../shared/ui/CurrencySelect.jsx'

// /groups/new — the group's picture (a photo, or an emoji on a colour), its
// name and currency, then land in it (the new group replaces this page in
// history, so Back from it goes to Groups). A picture that fails to upload
// doesn't undo the group: it says so and opens the group anyway.
export default function NewGroupPage() {
  const { baseCurrency, profile, loading } = useProfile()
  const t = useT('groups')
  return (
    <FormPage eyebrow={t('title')} title={t('create.title')} fallback="/groups">
      {/* The currency starts on the base currency, which the form reads once:
          wait for the profile rather than freeze the placeholder. */}
      {!profile && loading ? <RingLoader /> : <NewGroupForm baseCurrency={baseCurrency} />}
    </FormPage>
  )
}

function NewGroupForm({ baseCurrency }) {
  const navigate = useNavigate()
  const toast = useToast()
  const t = useT('groups')
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState(baseCurrency || 'EUR')
  const [cover, setCover] = useState(NO_COVER)
  const { busy, run } = useAsyncSubmit()

  async function submit() {
    if (!name.trim()) return
    await run(async () => {
      const id = await createGroup(name.trim(), currency || 'EUR')
      try {
        const file = await coverFile(cover)
        if (file) await uploadGroupImage(id, file)
      } catch (err) {
        console.error('[groups] cover upload failed:', err)
        toast({ title: t('header.photoFailed'), description: userMessage(err), status: 'error' })
      }
      navigate(`/groups/${id}`, { replace: true })
    })
  }

  return (
    <PageForm onSubmit={submit} busy={busy} submitLabel={t('create.submit')}>
      <Stack spacing={4}>
        <FormControl>
          <FormLabel>{t('cover.title')}</FormLabel>
          <CoverPicker value={cover} onChange={setCover} />
        </FormControl>
        <FormControl isRequired>
          <FormLabel>{t('create.name')}</FormLabel>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('create.nameHint')} />
        </FormControl>
        <FormControl>
          <FormLabel>{t('create.currency')}</FormLabel>
          <CurrencySelect value={currency} onChange={setCurrency} />
        </FormControl>
      </Stack>
    </PageForm>
  )
}
