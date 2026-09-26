// The legal documents' versions and the privacy facts the pages state, plus
// the small pure helpers the privacy screens use. Pure (unit-tested in
// test/legal.test.js).
//
// LOCKSTEP pairs, checked by the tests:
//   LEGAL_VERSIONS ≡ public.current_legal_versions() — the versions and
//     LEGAL_CHANGES live in supabase/functions/_shared/legal.ts, shared with
//     the update emails; see there for how to bump them.
//   RETENTION ≡ the intervals in public.purge_expired_personal_data() and
//     public.inactive_accounts() (0073), and INACTIVITY in
//     supabase/functions/_shared/inactivity.ts.
import { CONSENT_LABELS, LEGAL_CHANGES, LEGAL_VERSIONS } from '../../../supabase/functions/_shared/legal.ts'
import { MESSAGE_MAX, validatePrivacyRequest } from '../../../supabase/functions/_shared/privacyRequest.ts'
import { DEFAULT_LANGUAGE } from '../../shared/lib/i18n/language.js'
import { intlLocale, t } from '../../shared/lib/i18n/i18n.js'
import en from '../../locales/en/privacy.js'

export { REQUEST_KINDS, MESSAGE_MAX, validatePrivacyRequest }
  from '../../../supabase/functions/_shared/privacyRequest.ts'
export { LEGAL_VERSIONS, LEGAL_CHANGES } from '../../../supabase/functions/_shared/legal.ts'

export const CONTROLLER = 'Budgeer (Belgium)'

export const RETENTION = {
  notificationsDays: 90,
  groupLogYears: 2,
  rateLimitDays: 30,
  authLogDays: 30,
  inactiveWarnMonths: 23,
  inactiveDeleteMonths: 24,
  inactiveNoticeDays: 28,
}

// "23 September 2026" for an ISO date (the date itself, whatever the zone),
// in the app's language unless `locale` says otherwise.
export function formatVersion(iso, locale = intlLocale('en-GB')) {
  const [y, m, d] = String(iso).split('-').map(Number)
  if (!y || !m || !d) return String(iso ?? '')
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale,
    { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

// The change summaries newer than the user's last accepted versions (both
// documents share one timeline). Nothing accepted yet → every entry.
export function changesSince(status) {
  const seen = [status?.privacy_accepted, status?.terms_accepted].filter(Boolean).sort()[0] ?? null
  return LEGAL_CHANGES.filter((c) => !seen || c.version > seen)
}

// What the sign-up form sends as user metadata; the database records the
// acceptance only if these are the versions it has in force.
export function signupConsentMetadata() {
  return { accepted_privacy: LEGAL_VERSIONS.privacy, accepted_terms: LEGAL_VERSIONS.terms }
}

const SOURCES = ['signup', 'prompt', 'settings']
const has = (list, key) => Object.hasOwn(list, key)

// One consent-history row as a sentence, in the app's language: "Accepted
// the Privacy Notice (version 23 September 2026) when you signed up",
// "Weekly summary turned off in Settings". The purposes are CONSENT_LABELS'
// (privacy:consent.purposes); an unknown one shows as it is.
export function describeConsent(row) {
  const purpose = row?.purpose
  const what = has(CONSENT_LABELS, purpose)
    ? t(`privacy:consent.purposes.${purpose}`)
    : String(purpose ?? t('privacy:consent.unknown'))
  const where = SOURCES.includes(row?.source) ? ` ${t(`privacy:consent.sources.${row.source}`)}` : ''
  if (purpose === 'privacy_notice' || purpose === 'terms') {
    const version = row.version ? ` (${t('privacy:consent.version', { date: formatVersion(row.version) })})` : ''
    return t(row.granted ? 'privacy:consent.accepted' : 'privacy:consent.declined', { document: what, version, where })
  }
  return t(row?.granted ? 'privacy:consent.turnedOn' : 'privacy:consent.turnedOff', { what, where })
}

// The items of one LEGAL_CHANGES entry, in the app's language: the
// dictionary's copy of that version (privacy:gate.changes), or legal.ts's
// English items for a version the dictionary doesn't have yet.
export function changeItems(change) {
  const copy = en.gate.changes[change.version]
  return copy ? Object.keys(copy).map((k) => t(`privacy:gate.changes.${change.version}.${k}`)) : change.items
}

// The key (privacy:request.errors.<key>) for a validatePrivacyRequest error,
// which is English (the edge function shares it): found by asking the
// validator for each of its errors, so the two can't drift. null if unknown.
export function requestErrorKey(error) {
  const errors = {
    kind: validatePrivacyRequest({}).error,
    short: validatePrivacyRequest({ kind: 'other', message: '' }).error,
    long: validatePrivacyRequest({ kind: 'other', message: 'x'.repeat(MESSAGE_MAX + 1) }).error,
  }
  return Object.keys(errors).find((k) => errors[k] === error) ?? null
}

// The language a legal document is shown in: the English original when the
// address asks for it (?lang=en, where the translation notice links), else
// the app's. English is the version that prevails.
export function legalLanguage(asked, appLang) {
  return asked === DEFAULT_LANGUAGE ? asked : appLang
}

// The date by which a request received at `d` must be answered: one month
// (GDPR Art. 12(3)), clamped to the target month's length (31 Jan → 28 Feb).
export function responseDeadline(d = new Date()) {
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  const last = new Date(y, m + 1, 0).getDate()
  return new Date(y, m, Math.min(d.getDate(), last))
}

// budgeer-my-data-2026-09-23.json (local date).
export function exportFileName(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `budgeer-my-data-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`
}
