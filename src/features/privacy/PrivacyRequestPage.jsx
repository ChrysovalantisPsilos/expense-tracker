import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import {
  FormControl, FormHelperText, FormLabel, Select, Stack, Textarea, useToast,
} from '@chakra-ui/react'
import FormPage, { PageForm } from '../../shared/ui/FormPage.jsx'
import useGoBack from '../../shared/ui/useGoBack.js'
import { useAsyncSubmit } from '../../shared/lib/useAsyncSubmit.js'
import { MESSAGE_MAX, REQUEST_KINDS, requestErrorKey, responseDeadline, validatePrivacyRequest } from './legal.js'
import { sendPrivacyRequest } from './privacyData.js'
import { useProfile } from '../../shared/lib/ProfileProvider.jsx'
import { intlLocale } from '../../shared/lib/i18n/i18n.js'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

// /settings/privacy/request — restrict, object, or any other privacy
// request. It goes to the privacy inbox, and the reply goes to the account's
// email address. Sending goes back to Privacy.
export default function PrivacyRequestPage() {
  const t = useT('privacy')
  const toast = useToast()
  const back = useGoBack('/settings/privacy')
  const [kind, setKind] = useState('restrict')
  const [message, setMessage] = useState('')
  const { busy, run } = useAsyncSubmit()
  // The shared demo login (0090) sends no requests (privacy-request refuses it).
  const { isDemo } = useProfile()

  async function submit() {
    const checked = validatePrivacyRequest({ kind, message })
    if (checked.error) {
      const key = requestErrorKey(checked.error)
      toast({ title: key ? t(`request.errors.${key}`, { max: MESSAGE_MAX }) : checked.error, status: 'warning' })
      return
    }
    await run(async () => {
      await sendPrivacyRequest(checked)
      const by = responseDeadline().toLocaleDateString(intlLocale('en-GB'), { day: 'numeric', month: 'long', year: 'numeric' })
      toast({ title: t('request.sent'), status: 'success', description: t('request.sentBody', { date: by }) })
      back()
    }, { errorTitle: t('request.failed') })
  }

  if (isDemo) return <Navigate to="/settings/privacy" replace />
  return (
    <FormPage eyebrow={t('request.eyebrow')} title={t('request.title')} fallback="/settings/privacy">
      <PageForm onSubmit={submit} busy={busy} submitLabel={t('request.send')}>
        <Stack spacing={4}>
          <FormControl>
            <FormLabel>{t('request.about')}</FormLabel>
            <Select value={kind} onChange={(e) => setKind(e.target.value)}>
              {Object.keys(REQUEST_KINDS).map((k) => <option key={k} value={k}>{t(`request.kinds.${k}`)}</option>)}
            </Select>
          </FormControl>
          <FormControl>
            <FormLabel>{t('request.yourRequest')}</FormLabel>
            <Textarea rows={6} value={message} maxLength={MESSAGE_MAX}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t('request.placeholder')} />
            <FormHelperText>{t('request.help')}</FormHelperText>
          </FormControl>
        </Stack>
      </PageForm>
    </FormPage>
  )
}
