import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Stack, Button, FormControl, FormLabel, Input,
} from '@chakra-ui/react'
import { MailCheck, ArrowLeft } from 'lucide-react'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import AuthLayout from './AuthLayout.jsx'
import { Trans, useT } from '../../shared/lib/i18n/I18nProvider.jsx'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function ForgotPassword() {
  const t = useT('auth')
  const navigate = useNavigate()
  const { sendPasswordReset } = useAuth()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!EMAIL_RE.test(email.trim())) return
    setBusy(true)
    // Fire and forget: Supabase returns success whether or not the address is
    // registered, and we always show the same confirmation, so a submitter can
    // never learn which emails have accounts.
    await sendPasswordReset(email.trim())
    setBusy(false)
    setSent(true)
  }

  if (sent) {
    return (
      <AuthLayout icon={<MailCheck size={28} />} title={t('forgot.sentTitle')}
        subtitle={<Trans t={t} k="forgot.sent" components={{ email: <b>{email.trim()}</b> }} />}>
        <Button variant="outline" colorScheme="gray"
          leftIcon={<ArrowLeft size={16} />} onClick={() => navigate('/login')}>
          {t('backToLogIn')}
        </Button>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title={t('forgot.title')} subtitle={t('forgot.subtitle')}>
      <form onSubmit={handleSubmit}>
        <Stack spacing={4}>
          <FormControl isRequired>
            <FormLabel>{t('email')}</FormLabel>
            <Input type="email" autoComplete="email" value={email}
              onChange={(e) => setEmail(e.target.value)} />
          </FormControl>
          <Button type="submit" isLoading={busy} w="full"
            isDisabled={!EMAIL_RE.test(email.trim())}>
            {t('forgot.send')}
          </Button>
        </Stack>
      </form>

      <Button variant="link" colorScheme="brand" size="sm"
        leftIcon={<ArrowLeft size={14} />} onClick={() => navigate('/login')}>
        {t('backToLogIn')}
      </Button>
    </AuthLayout>
  )
}
