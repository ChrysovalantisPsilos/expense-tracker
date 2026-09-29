import { Trans } from '../../shared/lib/i18n/I18nProvider.jsx'
import LegalLayout, { Body, Bullets, Facts, Lead, MailLink, PageLink } from './LegalLayout.jsx'
import { PRIVACY_EMAIL } from '../../shared/lib/contact.js'
import { CONTROLLER, LEGAL_VERSIONS, RETENTION as R } from './legal.js'
import { useLegalText } from './useLegalText.js'
import { RETIRED_STORAGE_KEYS, STORAGE_KEYS } from '../../shared/lib/keys.js'
import { EXPIRATION_DB, REST_CACHE, RPC_CACHE } from '../../shared/lib/userDataCaches.js'

// The Privacy Notice (GDPR Art. 13/14). Every statement must stay true to the
// code and migrations — update it alongside any change to what is stored,
// encrypted, shared or sent, the services used, retention (0073) or account
// deletion (0072, _shared/accountDeletion.ts). A material change needs a new
// LEGAL_VERSIONS entry (and the SQL twin), which asks users to accept it.
// docs/GDPR.md is the matching record of processing.
//
// The words are in src/locales/<lang>/privacy.js under `notice`, one key per
// paragraph, bullet or fact; this file holds their order. English is the
// authoritative text and the Greek a translation of it: change both in the
// same commit, key by key (en/privacy.js's header has the details).

// ===========================================================================
// EDIT HERE: what we hold, why, and on what legal basis — in this order.
// ===========================================================================

const DATA = ['account', 'profile', 'money', 'payment', 'groups', 'others', 'notifications', 'consents', 'technical']

// [id, the labelled lines of its box]
const PURPOSES = ['account', 'groups', 'messages', 'accountEmails', 'weekly', 'ai', 'security', 'legal']
  .map((id) => [id, ['what', 'basis']])

const RECIPIENTS = [
  ['supabase', ['role', 'where', 'safeguard']],
  ['vercel', ['role', 'where', 'safeguard']],
  ['resend', ['role', 'where', 'safeguard']],
  ['cloudflare', ['role', 'where', 'safeguard']],
  ['gmail', ['role', 'where', 'safeguard']],
  ['google', ['role', 'where']],
  ['push', ['role']],
  ['frankfurter', ['role']],
  ['anthropic', ['role', 'where', 'safeguard']],
  ['payments', ['role']],
  ['users', ['role']],
]

const RETENTION_ITEMS = ['account', 'notifications', 'groupLog', 'invites', 'rateLimits', 'mailbox', 'inactive', 'consents', 'aiSummaries', 'backups']

const RIGHTS = [
  ['access', ['inApp', 'byEmail']],
  ['rectification', ['inApp', 'byEmail']],
  ['erasure', ['inApp', 'whatStays', 'byEmail']],
  ['restriction', ['how']],
  ['portability', ['inApp']],
  ['objection', ['how']],
  ['withdraw', ['inApp']],
  ['automated', ['practice']],
  ['complaint', ['where', 'also']],
]

const SECURITY = ['https', 'encrypted', 'rls', 'passwords', 'rateLimits', 'breach']

// Every key in STORAGE_KEYS (and each service-worker cache) is named here;
// test/storageKeys.test.js fails if one is missing. Each is a self-closing
// tag in the `notice.device` texts.
const DEVICE = ['session', 'offline', 'appFiles', 'choices', 'recentGroups', 'importChoices', 'rates', 'signIn', 'acceptance', 'tab', 'retired']
const STORAGE_NAMES = {
  restCache: <code>{REST_CACHE}</code>,
  rpcCache: <code>{RPC_CACHE}</code>,
  expirationDb: <code>{EXPIRATION_DB}</code>,
  appearance: <code>{STORAGE_KEYS.appearance}</code>,
  language: <code>{STORAGE_KEYS.language}</code>,
  overviewView: <code>{STORAGE_KEYS.overviewView}</code>,
  notifPrompted: <code>{STORAGE_KEYS.notifPrompted}</code>,
  paymentAskDismissed: <code>{STORAGE_KEYS.paymentAskDismissed}</code>,
  recentGroups: <code>{STORAGE_KEYS.recentGroups}</code>,
  aiSummaryHidden: <code>{STORAGE_KEYS.aiSummaryHidden}</code>,
  importMappings: <code>{STORAGE_KEYS.importMappings}</code>,
  importHolder: <code>{STORAGE_KEYS.importHolder}</code>,
  fxRatePrefix: <code>{STORAGE_KEYS.fxRatePrefix}…</code>,
  pendingInvite: <code>{STORAGE_KEYS.pendingInvite}</code>,
  returnPath: <code>{STORAGE_KEYS.returnPath}</code>,
  legalAccepted: <code>{STORAGE_KEYS.legalAccepted}</code>,
  pendingEmail: <code>{STORAGE_KEYS.pendingEmail}</code>,
  passkeyPrompted: <code>{STORAGE_KEYS.passkeyPrompted}</code>,
  linkingGoogle: <code>{STORAGE_KEYS.linkingGoogle}</code>,
  legalConsentPending: <code>{STORAGE_KEYS.legalConsentPending}</code>,
  chunkReload: <code>{STORAGE_KEYS.chunkReload}</code>,
  whatsNewSeen: <code>{RETIRED_STORAGE_KEYS.whatsNewSeen}</code>,
}

// ===========================================================================

export default function Privacy() {
  const doc = useLegalText()
  const { t } = doc
  const components = {
    lead: <Lead />,
    email: <MailLink to={PRIVACY_EMAIL} />,
    code: <code />,
    terms: <PageLink to={doc.href('/terms')} />,
    ...STORAGE_NAMES,
  }
  // One paragraph, bullet or fact of the notice.
  const text = (key, values) => <Trans t={t} k={`notice.${key}`} values={values} components={components} />
  const facts = (group, list) => list.map(([id, lines]) => ({
    name: t(`notice.${group}.${id}.name`),
    lines: lines.map((line) => [t(`notice.labels.${line}`), text(`${group}.${id}.${line}`)]),
  }))
  const retentionValues = {
    notifications: { days: R.notificationsDays },
    groupLog: { years: R.groupLogYears },
    rateLimits: { days: R.rateLimitDays },
    inactive: { warnMonths: R.inactiveWarnMonths, deleteMonths: R.inactiveDeleteMonths, noticeDays: R.inactiveNoticeDays },
  }

  const sections = [
    { id: 'who', body: <Body>{text('who.body', { controller: CONTROLLER })}</Body> },
    { id: 'short', body: <Bullets items={['private', 'encrypted', 'noAds', 'control'].map((id) => text(`short.${id}`))} /> },
    { id: 'data', body: (
      <>
        <Body>{text('data.intro')}</Body>
        <Bullets items={DATA.map((id) => text(`data.${id}`))} />
        <Body>{text('data.onDevice')}</Body>
      </>
    ) },
    { id: 'purposes', body: <Facts items={facts('purposes', PURPOSES)} /> },
    { id: 'recipients', body: (
      <>
        <Body>{text('recipients.intro')}</Body>
        <Facts items={facts('recipients', RECIPIENTS)} />
      </>
    ) },
    { id: 'transfers', body: <Body>{text('transfers.body')}</Body> },
    { id: 'retention', body: <Bullets items={RETENTION_ITEMS.map((id) => text(`retention.${id}`, retentionValues[id]))} /> },
    { id: 'rights', body: (
      <>
        <Body>{text('rights.intro')}</Body>
        <Facts items={facts('rights', RIGHTS)} />
      </>
    ) },
    { id: 'security', body: <Bullets items={SECURITY.map((id) => text(`security.${id}`))} /> },
    { id: 'device', body: (
      <>
        <Body>{text('device.intro')}</Body>
        <Bullets items={DEVICE.map((id) => text(`device.${id}`))} />
        <Body>{text('device.sent')}</Body>
        <Body>{text('device.password')}</Body>
      </>
    ) },
    { id: 'children', body: <Body>{text('children.body')}</Body> },
    { id: 'changes', body: <Body>{text('changes.body', { version: LEGAL_VERSIONS.privacy })}</Body> },
  ].map((s) => ({ ...s, title: t(`notice.${s.id}.title`) }))

  return (
    <LegalLayout
      doc={doc}
      eyebrow={t('notice.eyebrow')}
      title={t('notice.title')}
      intro={t('notice.intro')}
      version={LEGAL_VERSIONS.privacy}
      sections={sections}
    />
  )
}
