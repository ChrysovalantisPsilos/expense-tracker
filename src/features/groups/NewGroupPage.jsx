import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FormControl, FormLabel, Input, Stack } from '@chakra-ui/react'
import { useProfile } from '../../shared/lib/ProfileProvider.jsx'
import { useAsyncSubmit } from '../../shared/lib/useAsyncSubmit.js'
import FormPage, { PageForm } from '../../shared/ui/FormPage.jsx'
import RingLoader from '../../shared/ui/RingLoader.jsx'
import { createGroup } from './groups.js'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'
import CurrencySelect from '../../shared/ui/CurrencySelect.jsx'

// /groups/new — name a group and pick its currency, then land in it (the
// new group replaces this page in history, so Back from it goes to Groups).
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
  const t = useT('groups')
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState(baseCurrency || 'EUR')
  const { busy, run } = useAsyncSubmit()

  async function submit() {
    if (!name.trim()) return
    await run(async () => {
      const id = await createGroup(name.trim(), currency || 'EUR')
      navigate(`/groups/${id}`, { replace: true })
    })
  }

  return (
    <PageForm onSubmit={submit} busy={busy} submitLabel={t('create.submit')}>
      <Stack spacing={4}>
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
