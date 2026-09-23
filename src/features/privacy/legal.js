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

export {
  REQUEST_KINDS, MESSAGE_MAX, validatePrivacyRequest,
} from '../../../supabase/functions/_shared/privacyRequest.ts'
export { LEGAL_VERSIONS, LEGAL_CHANGES } from '../../../supabase/functions/_shared/legal.ts'
export { DELETION_SCOPE } from '../../../supabase/functions/_shared/accountDeletion.ts'

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

// "23 September 2026" for an ISO date (the date itself, whatever the zone).
export function formatVersion(iso) {
  const [y, m, d] = String(iso).split('-').map(Number)
  if (!y || !m || !d) return String(iso ?? '')
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB',
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

const SOURCE_LABELS = {
  signup: 'when you signed up',
  prompt: 'after an update',
  settings: 'in Settings',
}

// One consent-history row as a sentence: "Accepted the Privacy Notice
// (version 23 September 2026) when you signed up", "Weekly summary turned off
// in Settings".
export function describeConsent(row) {
  const what = CONSENT_LABELS[row?.purpose] ?? String(row?.purpose ?? 'Unknown')
  const where = SOURCE_LABELS[row?.source] ?? ''
  const tail = where ? ` ${where}` : ''
  if (row?.purpose === 'privacy_notice' || row?.purpose === 'terms') {
    const v = row.version ? ` (version ${formatVersion(row.version)})` : ''
    return `${row.granted ? 'Accepted' : 'Declined'} the ${what}${v}${tail}`
  }
  return `${what} turned ${row?.granted ? 'on' : 'off'}${tail}`
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
