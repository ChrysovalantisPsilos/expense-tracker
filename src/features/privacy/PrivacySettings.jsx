import { useCallback, useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import {
  Box, Button, HStack, Link, Stack, Text, useToast,
} from '@chakra-ui/react'
import {
  Download, FileText, History, Mail, PencilLine, Scale, ShieldOff, Trash2, UserCheck,
} from 'lucide-react'
import Panel from '../../shared/ui/kit/Panel.jsx'
import { shortDateTime } from '../../shared/lib/dates.js'
import { useAsyncSubmit } from '../../shared/lib/useAsyncSubmit.js'
import SettingsPage from '../settings/SettingsPage.jsx'
import { useProfile } from '../../shared/lib/ProfileProvider.jsx'
import { NotificationPrefs } from '../settings/NotificationSettings.jsx'
import { describeConsent } from './legal.js'
import { PRIVACY_EMAIL } from '../../shared/lib/contact.js'
import { downloadMyData, listMyConsents } from './privacyData.js'
import RingLoader, { RingSpinner } from '../../shared/ui/RingLoader.jsx'
import { Trans, useT } from '../../shared/lib/i18n/I18nProvider.jsx'

// Settings → Privacy: each GDPR right with the way to use it here, the
// optional-message switches (consent), and the consent history.
export default function PrivacySettings() {
  const t = useT('privacy')
  // The shared demo login (0090) can't be deleted and sends no requests.
  const { isDemo } = useProfile()
  const [consents, setConsents] = useState(null)
  const loadConsents = useCallback(() => {
    listMyConsents().then(setConsents).catch(() => setConsents([]))
  }, [])
  useEffect(loadConsents, [loadConsents])

  return (
    <SettingsPage title={t('settings.title')} description={t('settings.description')}>
      <Text fontSize="sm" color="text.muted">
        <Trans t={t} k="settings.intro" components={{
          email: <Link href={`mailto:${PRIVACY_EMAIL}`} variant="inline">{PRIVACY_EMAIL}</Link>,
          privacy: <Link as={RouterLink} to="/privacy" variant="inline" />,
          terms: <Link as={RouterLink} to="/terms" variant="inline" />,
        }} />
      </Text>

      <DownloadRight />

      <Right icon={PencilLine} id="correct">
        <HStack spacing={2} flexWrap="wrap">
          <Button as={RouterLink} to="/settings/account" size="sm" variant="outline">{t('settings.correct.profile')}</Button>
          <Button as={RouterLink} to="/transactions" size="sm" variant="outline">{t('settings.correct.transactions')}</Button>
        </HStack>
      </Right>

      <Right icon={Trash2} id="delete">
        {!isDemo && (
          <Button as={RouterLink} to="/settings/security" size="sm" variant="outline" colorScheme="red">
            {t('settings.delete.go')}
          </Button>
        )}
      </Right>

      <RequestRight isDemo={isDemo} />

      <NotificationPrefs title={t('settings.consent')} onChanged={loadConsents} />

      <Right icon={UserCheck} id="automated" />

      <Right icon={Scale} id="complain" />

      <ConsentHistory consents={consents} />
    </SettingsPage>
  )
}

// One right: its title, article and text are privacy:settings.<id>.title /
// .text and settings.articles.<id>.
function Right({ icon, id, children }) {
  const t = useT('privacy')
  return (
    <Panel title={t(`settings.${id}.title`)} icon={icon} subtitle={t(`settings.articles.${id}`)}>
      <Text fontSize="sm" color="text.muted" mb={children ? 4 : 0}>{t(`settings.${id}.text`)}</Text>
      {children}
    </Panel>
  )
}

function DownloadRight() {
  const t = useT('privacy')
  const toast = useToast()
  const { busy, run } = useAsyncSubmit()
  const download = () => run(async () => {
    await downloadMyData()
    toast({ title: t('gate.downloaded'), status: 'success', description: t('settings.download.unprotected') })
  }, { errorTitle: t('gate.downloadFailed') })
  return (
    <Right icon={Download} id="download">
      <HStack spacing={2} flexWrap="wrap">
        <Button leftIcon={<Download size={16} />} size="sm" isLoading={busy} onClick={download}
          loadingText={t('gate.gathering')} spinner={<RingSpinner />}>
          {t('settings.download.button')}
        </Button>
        <Button as={RouterLink} to="/settings/data" size="sm" variant="ghost">{t('settings.download.backup')}</Button>
      </HStack>
    </Right>
  )
}

function RequestRight({ isDemo }) {
  const t = useT('privacy')
  return (
    <Right icon={ShieldOff} id="request">
      <HStack spacing={2} flexWrap="wrap">
        {!isDemo && (
          <Button as={RouterLink} to="/settings/privacy/request" leftIcon={<Mail size={16} />} size="sm"
            variant="outline">
            {t('settings.request.send')}
          </Button>
        )}
        <Button as="a" href={`mailto:${PRIVACY_EMAIL}`} size="sm" variant="ghost" leftIcon={<FileText size={16} />}>
          {t('settings.request.email')}
        </Button>
      </HStack>
    </Right>
  )
}

function ConsentHistory({ consents }) {
  const t = useT('privacy')
  return (
    <Panel title={t('settings.history.title')} icon={History}>
      {consents === null ? (
        <RingLoader compact />
      ) : consents.length === 0 ? (
        <Text fontSize="sm" color="text.muted">{t('settings.history.empty')}</Text>
      ) : (
        <Stack spacing={3}>
          {consents.map((c) => (
            <Box key={c.id}>
              <Text fontSize="sm">{describeConsent(c)}</Text>
              <Text fontSize="xs" color="text.muted">
                <time dateTime={c.created_at}>{shortDateTime(c.created_at)}</time>
              </Text>
            </Box>
          ))}
        </Stack>
      )}
    </Panel>
  )
}
