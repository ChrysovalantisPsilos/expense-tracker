import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import {
  FormControl, FormHelperText, FormLabel, Select, Stack, Textarea, useToast,
} from '@chakra-ui/react'
import FormPage, { PageForm } from '../../shared/ui/FormPage.jsx'
import useGoBack from '../../shared/ui/useGoBack.js'
import { useAsyncSubmit } from '../../shared/lib/useAsyncSubmit.js'
import { MESSAGE_MAX, REQUEST_KINDS, responseDeadline, validatePrivacyRequest } from './legal.js'
import { sendPrivacyRequest } from './privacyData.js'
import { useProfile } from '../../shared/lib/ProfileProvider.jsx'

// /settings/privacy/request — restrict, object, or any other privacy
// request. It goes to the privacy inbox, and the reply goes to the account's
// email address. Sending goes back to Privacy.
export default function PrivacyRequestPage() {
  const toast = useToast()
  const back = useGoBack('/settings/privacy')
  const [kind, setKind] = useState('restrict')
  const [message, setMessage] = useState('')
  const { busy, run } = useAsyncSubmit()
  // The shared demo login (0090) sends no requests (privacy-request refuses it).
  const { isDemo } = useProfile()

  async function submit() {
    const checked = validatePrivacyRequest({ kind, message })
    if (checked.error) { toast({ title: checked.error, status: 'warning' }); return }
    await run(async () => {
      await sendPrivacyRequest(checked)
      const by = responseDeadline().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
      toast({ title: 'Request sent', status: 'success',
        description: `We’ve emailed you a receipt, and we’ll reply to your account’s email address by ${by}.` })
      back()
    }, { errorTitle: 'Couldn’t send your request' })
  }

  if (isDemo) return <Navigate to="/settings/privacy" replace />
  return (
    <FormPage eyebrow="Privacy" title="Privacy request" fallback="/settings/privacy">
      <PageForm onSubmit={submit} busy={busy} submitLabel="Send request">
        <Stack spacing={4}>
          <FormControl>
            <FormLabel>What is it about?</FormLabel>
            <Select value={kind} onChange={(e) => setKind(e.target.value)}>
              {Object.entries(REQUEST_KINDS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </Select>
          </FormControl>
          <FormControl>
            <FormLabel>Your request</FormLabel>
            <Textarea rows={6} value={message} maxLength={MESSAGE_MAX}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Tell us what you’d like us to do, and which data it concerns." />
            <FormHelperText>We answer within one month. Up to 3 requests a day.</FormHelperText>
          </FormControl>
        </Stack>
      </PageForm>
    </FormPage>
  )
}
