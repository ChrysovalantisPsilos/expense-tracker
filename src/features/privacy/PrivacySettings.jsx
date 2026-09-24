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
import { NotificationPrefs } from '../settings/NotificationSettings.jsx'
import { describeConsent } from './legal.js'
import { PRIVACY_EMAIL } from '../../shared/lib/contact.js'
import { downloadMyData, listMyConsents } from './privacyData.js'
import RingLoader, { RingSpinner } from '../../shared/ui/RingLoader.jsx'

// Settings → Privacy: each GDPR right with the way to use it here, the
// optional-message switches (consent), and the consent history.
export default function PrivacySettings() {
  const [consents, setConsents] = useState(null)
  const loadConsents = useCallback(() => {
    listMyConsents().then(setConsents).catch(() => setConsents([]))
  }, [])
  useEffect(loadConsents, [loadConsents])

  return (
    <SettingsPage title="Privacy" description="Your data rights, consents and requests">
      <Text fontSize="sm" color="text.muted">
        You have these rights under the GDPR. Use them here, or email{' '}
        <Link href={`mailto:${PRIVACY_EMAIL}`} variant="inline">{PRIVACY_EMAIL}</Link> — we answer
        within one month. Details are in the{' '}
        <Link as={RouterLink} to="/privacy" variant="inline">Privacy Notice</Link> and the{' '}
        <Link as={RouterLink} to="/terms" variant="inline">Terms of Use</Link>.
      </Text>

      <DownloadRight />

      <Right icon={PencilLine} title="Correct your data" article="Art. 16"
        text="Change your name, picture, currency and payment details, or edit any expense, income, budget or recurring payment where it’s shown. For anything else, such as your email address, send a request below.">
        <HStack spacing={2} flexWrap="wrap">
          <Button as={RouterLink} to="/settings/account" size="sm" variant="outline">Edit profile</Button>
          <Button as={RouterLink} to="/transactions" size="sm" variant="outline">Your transactions</Button>
        </HStack>
      </Right>

      <Right icon={Trash2} title="Delete your account" article="Art. 17"
        text="Permanently deletes your account and personal data. Group expenses you were part of stay for the other members, shown as “Former member” with no link to you. The delete screen lists exactly what goes and what stays.">
        <Button as={RouterLink} to="/settings/security" size="sm" variant="outline" colorScheme="red">
          Go to Delete account
        </Button>
      </Right>

      <RequestRight />

      <NotificationPrefs title="Withdraw or give consent" onChanged={loadConsents} />

      <Right icon={UserCheck} title="Automated decisions" article="Art. 22"
        text="We make no decisions about you based solely on automated processing with legal or similarly significant effects. The one automatic action is deleting accounts unused for 2 years — only after an email warning, and logging in stops it." />

      <Right icon={Scale} title="Complain to a supervisory authority" article="Art. 77"
        text="Belgian Data Protection Authority (APD/GBA), Rue de la Presse 35 / Drukpersstraat 35, 1000 Brussels · contact@apd-gba.be · +32 2 274 48 00 · www.dataprotectionauthority.be — or the authority where you live or work." />

      <ConsentHistory consents={consents} />
    </SettingsPage>
  )
}

function Right({ icon, title, article, text, children }) {
  return (
    <Panel title={title} icon={icon} subtitle={article}>
      <Text fontSize="sm" color="text.muted" mb={children ? 4 : 0}>{text}</Text>
      {children}
    </Panel>
  )
}

function DownloadRight() {
  const toast = useToast()
  const { busy, run } = useAsyncSubmit()
  const download = () => run(async () => {
    await downloadMyData()
    toast({ title: 'Your data was downloaded', status: 'success',
      description: 'The file isn’t password-protected — keep it somewhere safe.' })
  }, { errorTitle: 'Couldn’t download your data' })
  return (
    <Right icon={Download} title="Download your data" article="Art. 15 and 20"
      text="One JSON file with everything we hold about you: account and profile, payment details, consents, notifications, devices for push (service only), categories, rules, accounts, budgets, goals, recurring payments, transactions, and your part of your groups. Nothing about other people beyond what you already see in the app.">
      <HStack spacing={2} flexWrap="wrap">
        <Button leftIcon={<Download size={16} />} size="sm" isLoading={busy} onClick={download}
          loadingText="Gathering your data…" spinner={<RingSpinner />}>
          Download my data
        </Button>
        <Button as={RouterLink} to="/settings/data" size="sm" variant="ghost">Backup and restore</Button>
      </HStack>
    </Right>
  )
}

function RequestRight() {
  return (
    <Right icon={ShieldOff} title="Restrict or object, or another request" article="Art. 18 and 21"
      text="Ask us to limit how we use your data, object to a use based on our legitimate interest, or make any other privacy request. It goes to our privacy inbox, and we reply to your account’s email address.">
      <HStack spacing={2} flexWrap="wrap">
        <Button as={RouterLink} to="/settings/privacy/request" leftIcon={<Mail size={16} />} size="sm"
          variant="outline">
          Send a request
        </Button>
        <Button as="a" href={`mailto:${PRIVACY_EMAIL}`} size="sm" variant="ghost" leftIcon={<FileText size={16} />}>
          Email instead
        </Button>
      </HStack>
    </Right>
  )
}

function ConsentHistory({ consents }) {
  return (
    <Panel title="Your consent history" icon={History}>
      {consents === null ? (
        <RingLoader compact />
      ) : consents.length === 0 ? (
        <Text fontSize="sm" color="text.muted">Nothing recorded yet.</Text>
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
