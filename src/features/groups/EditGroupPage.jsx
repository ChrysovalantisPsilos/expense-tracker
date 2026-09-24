import { useState } from 'react'
import { FormControl, FormLabel, Input, Text, useToast } from '@chakra-ui/react'
import { useAsyncSubmit } from '../../shared/lib/useAsyncSubmit.js'
import Panel from '../../shared/ui/kit/Panel.jsx'
import { PageForm } from '../../shared/ui/FormPage.jsx'
import useGoBack from '../../shared/ui/useGoBack.js'
import { renameGroup } from './groups.js'
import GroupFormPage from './GroupFormPage.jsx'

// /groups/:id/edit — the owner renames the group (RLS enforces owner-only).
export default function EditGroupPage() {
  return (
    <GroupFormPage title="Edit group">
      {(ctx) => (ctx.isOwner ? <RenameForm {...ctx} /> : (
        <Panel><Text color="text.muted">Only the group’s owner can change it.</Text></Panel>
      ))}
    </GroupFormPage>
  )
}

function RenameForm({ group, groupPath }) {
  const toast = useToast()
  const back = useGoBack(groupPath)
  const [name, setName] = useState(group.name)
  const { busy, run } = useAsyncSubmit()

  async function submit() {
    if (!name.trim()) return
    await run(async () => {
      await renameGroup(group.id, name.trim())
      toast({ title: 'Group renamed', status: 'success' })
      back()
    })
  }

  return (
    <PageForm onSubmit={submit} busy={busy}>
      <FormControl isRequired>
        <FormLabel>Group name</FormLabel>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </FormControl>
    </PageForm>
  )
}
