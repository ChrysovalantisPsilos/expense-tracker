import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FormControl, FormLabel, Input, Select, Stack } from '@chakra-ui/react'
import { CURRENCIES } from '../../shared/lib/currency.js'
import { useProfile } from '../../shared/lib/ProfileProvider.jsx'
import { useAsyncSubmit } from '../../shared/lib/useAsyncSubmit.js'
import FormPage, { PageForm } from '../../shared/ui/FormPage.jsx'
import RingLoader from '../../shared/ui/RingLoader.jsx'
import { createGroup } from './groups.js'

// /groups/new — name a group and pick its currency, then land in it (the
// new group replaces this page in history, so Back from it goes to Groups).
export default function NewGroupPage() {
  const { baseCurrency, profile, loading } = useProfile()
  return (
    <FormPage eyebrow="Groups" title="New group" fallback="/groups">
      {/* The currency starts on the base currency, which the form reads once:
          wait for the profile rather than freeze the placeholder. */}
      {!profile && loading ? <RingLoader /> : <NewGroupForm baseCurrency={baseCurrency} />}
    </FormPage>
  )
}

function NewGroupForm({ baseCurrency }) {
  const navigate = useNavigate()
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
    <PageForm onSubmit={submit} busy={busy} submitLabel="Create group">
      <Stack spacing={4}>
        <FormControl isRequired>
          <FormLabel>Name</FormLabel>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Italy 2026, Flat 3B…" />
        </FormControl>
        <FormControl>
          <FormLabel>Currency</FormLabel>
          <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </FormControl>
      </Stack>
    </PageForm>
  )
}
