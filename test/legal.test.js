// GDPR pieces: legal-document versions and retention numbers (and their SQL
// twins), the privacy screens' pure helpers, the privacy-request validation,
// the inactive-account dates, and the shared account-deletion sequence.
import test from 'node:test'
import assert from 'node:assert/strict'
import { latestSql } from './migrations.js'
import {
  LEGAL_VERSIONS, LEGAL_CHANGES, RETENTION, changesSince, describeConsent, exportFileName,
  formatVersion, responseDeadline, signupConsentMetadata, validatePrivacyRequest, REQUEST_KINDS,
  changeItems, legalLanguage, requestErrorKey, MESSAGE_MAX,
} from '../src/features/privacy/legal.js'
import { DELETION_SCOPE } from '../supabase/functions/_shared/accountDeletion.ts'
import { loadLanguage } from '../src/shared/lib/i18n/i18n.js'
import enPrivacy from '../src/locales/en/privacy.js'
import enSettings from '../src/locales/en/settings.js'
import elSettings from '../src/locales/el/settings.js'
import { INACTIVITY, deletionDate, formatDay } from '../supabase/functions/_shared/inactivity.ts'
import { deleteAccount } from '../supabase/functions/_shared/accountDeletion.ts'

test('LEGAL_VERSIONS match current_legal_versions() in SQL', () => {
  const sql = latestSql('current_legal_versions')
  assert.equal(sql.match(/'privacy', '([^']+)'/)[1], LEGAL_VERSIONS.privacy)
  assert.equal(sql.match(/'terms', '([^']+)'/)[1], LEGAL_VERSIONS.terms)
  // Every version in force has a change summary for the update prompt.
  assert.ok(LEGAL_CHANGES.some((c) => c.version === LEGAL_VERSIONS.privacy))
  assert.deepEqual(signupConsentMetadata(),
    { accepted_privacy: LEGAL_VERSIONS.privacy, accepted_terms: LEGAL_VERSIONS.terms })
})

test('RETENTION matches the purge and inactivity SQL, and the edge-function copy', () => {
  const purge = latestSql('purge_expired_personal_data')
  assert.match(purge, new RegExp(`notifications where created_at < now\\(\\) - interval '${RETENTION.notificationsDays} days'`))
  assert.match(purge, new RegExp(`group_audit_log where created_at < now\\(\\) - interval '${RETENTION.groupLogYears} years'`))
  assert.match(purge, new RegExp(`rate_limits where window_start < now\\(\\) - interval '${RETENTION.rateLimitDays} days'`))
  assert.match(purge, new RegExp(`audit_log_entries where created_at < now\\(\\) - interval '${RETENTION.authLogDays} days'`))
  const sel = latestSql('inactive_accounts')
  assert.match(sel, new RegExp(`interval '${RETENTION.inactiveWarnMonths} months'`))
  assert.match(sel, new RegExp(`interval '${RETENTION.inactiveDeleteMonths} months'`))
  assert.match(sel, new RegExp(`interval '${RETENTION.inactiveNoticeDays} days'`))
  assert.deepEqual(INACTIVITY, {
    warnAfterMonths: RETENTION.inactiveWarnMonths,
    deleteAfterMonths: RETENTION.inactiveDeleteMonths,
    minNoticeDays: RETENTION.inactiveNoticeDays,
  })
})

test('formatVersion reads an ISO date as that calendar day', () => {
  assert.equal(formatVersion('2026-09-23'), '23 September 2026')
  assert.equal(formatVersion('2027-01-01'), '1 January 2027')
  assert.equal(formatVersion('nonsense'), 'nonsense')
})

test('changesSince lists only versions newer than the oldest accepted document', () => {
  assert.equal(changesSince({}).length, LEGAL_CHANGES.length)
  assert.equal(changesSince(null).length, LEGAL_CHANGES.length)
  assert.deepEqual(changesSince({ privacy_accepted: LEGAL_VERSIONS.privacy, terms_accepted: LEGAL_VERSIONS.terms }), [])
  // One document behind → still shown.
  assert.equal(changesSince({ privacy_accepted: LEGAL_VERSIONS.privacy, terms_accepted: '2000-01-01' }).length,
    LEGAL_CHANGES.length)
})

test('describeConsent phrases each history row', () => {
  assert.equal(describeConsent({ purpose: 'privacy_notice', version: '2026-09-23', granted: true, source: 'signup' }),
    'Accepted the Privacy Notice (version 23 September 2026) when you signed up')
  assert.equal(describeConsent({ purpose: 'terms', version: '2026-09-23', granted: true, source: 'prompt' }),
    'Accepted the Terms of Use (version 23 September 2026) after an update')
  assert.equal(describeConsent({ purpose: 'weekly_digest', granted: false, source: 'settings' }),
    'Weekly summary turned off in Settings')
  assert.equal(describeConsent({ purpose: 'push_notifications', granted: true, source: 'settings' }),
    'Push notifications turned on in Settings')
  assert.equal(describeConsent({ purpose: 'mystery', granted: true }), 'mystery turned on')
})

test('responseDeadline is one calendar month later, clamped to the month end', () => {
  const iso = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
  assert.equal(iso(responseDeadline(new Date(2026, 0, 31))), '2026-2-28')
  assert.equal(iso(responseDeadline(new Date(2028, 0, 31))), '2028-2-29')
  assert.equal(iso(responseDeadline(new Date(2026, 8, 23))), '2026-10-23')
  assert.equal(iso(responseDeadline(new Date(2026, 11, 15))), '2027-1-15')
})

test('exportFileName uses the local date', () => {
  assert.equal(exportFileName(new Date(2026, 8, 3, 23, 59)), 'budgeer-my-data-2026-09-03.json')
})

test('validatePrivacyRequest accepts only a known kind and a sensible message', () => {
  assert.deepEqual(validatePrivacyRequest({ kind: 'restrict', message: '  Please pause my data.  ' }),
    { kind: 'restrict', message: 'Please pause my data.' })
  assert.ok(validatePrivacyRequest({ kind: 'toString', message: 'long enough text' }).error)
  assert.ok(validatePrivacyRequest({ kind: '__proto__', message: 'long enough text' }).error)
  assert.ok(validatePrivacyRequest({ kind: 'object', message: 'short' }).error)
  assert.ok(validatePrivacyRequest({ kind: 'object', message: 'x'.repeat(2001) }).error)
  assert.ok(validatePrivacyRequest(null).error)
  assert.ok(Object.keys(REQUEST_KINDS).includes('object'))
})

test('deletionDate: 24 months after last use, but never under 28 days after the warning', () => {
  const lastActive = new Date('2024-01-31T10:00:00Z')
  // Warned at 23 months: the 24-month mark (clamped 31 Jan → 31 Jan) is later.
  assert.equal(deletionDate(lastActive, new Date('2025-12-31T04:45:00Z')).toISOString(), '2026-01-31T10:00:00.000Z')
  // Warned late (first sweep after years idle): 28 days after the warning.
  assert.equal(deletionDate(lastActive, new Date('2026-09-23T04:45:00Z')).toISOString(), '2026-10-21T04:45:00.000Z')
  // Month clamping: 29 Feb 2024 + 24 months → 28 Feb 2026.
  assert.equal(deletionDate(new Date('2024-02-29T00:00:00Z'), new Date('2024-03-01T00:00:00Z')).toISOString(),
    '2026-02-28T00:00:00.000Z')
  assert.equal(formatDay(new Date('2026-10-21T23:30:00Z')), '21 October 2026')
})

// A minimal stand-in for the service-role client: records every call.
// `doomed` is what transfer_owned_groups returns (the sole-owner groups);
// `rpcError` makes that call fail.
function fakeAdmin({ doomed = [], rpcError = null, files = {} } = {}) {
  const log = []
  return {
    log,
    rpc: (fn, args) => {
      log.push(['rpc', fn, args])
      return Promise.resolve(rpcError ? { data: null, error: rpcError } : { data: doomed, error: null })
    },
    storage: {
      from: (bucket) => ({
        list: (folder) => {
          const key = `${bucket}/${folder}`
          const left = files[key] ?? []
          files[key] = []
          return Promise.resolve({ data: left.map((name) => ({ id: name, name })), error: null })
        },
        remove: (paths) => { log.push(['remove', bucket, paths]); return Promise.resolve({ error: null }) },
      }),
    },
    auth: { admin: { deleteUser: (uid) => { log.push(['deleteUser', uid]); return Promise.resolve({ error: null }) } } },
  }
}

test('deleteAccount hands over shared groups in one call, removes files, then deletes the user', async () => {
  const admin = fakeAdmin({
    doomed: ['g-solo'],
    files: { 'avatars/u1': ['avatar.jpg'], 'group-images/g-solo': ['cover.png'], 'group-images/g-shared': ['keep.png'] },
  })
  await deleteAccount(admin, 'u1')
  assert.deepEqual(admin.log, [
    ['rpc', 'transfer_owned_groups', { p_user: 'u1' }],
    ['remove', 'avatars', ['u1/avatar.jpg']],
    ['remove', 'group-images', ['g-solo/cover.png']],
    ['deleteUser', 'u1'],
  ])
})

test('deleteAccount stops before deleting anything when the hand-over fails', async () => {
  const failure = new Error('hand-over failed')
  const admin = fakeAdmin({ rpcError: failure, files: { 'avatars/u1': ['avatar.jpg'] } })
  await assert.rejects(deleteAccount(admin, 'u1'), failure)
  assert.deepEqual(admin.log, [['rpc', 'transfer_owned_groups', { p_user: 'u1' }]])
})

test('legalLanguage: the English original only when the address asks for it', () => {
  assert.equal(legalLanguage('en', 'el'), 'en')
  assert.equal(legalLanguage(null, 'el'), 'el')
  assert.equal(legalLanguage('el', 'en'), 'en')
  assert.equal(legalLanguage('fr', 'el'), 'el') // anything else: the app's language
  assert.equal(legalLanguage(undefined, 'en'), 'en')
})

test('requestErrorKey: each of the validator\'s English errors has its key', () => {
  assert.equal(requestErrorKey(validatePrivacyRequest({}).error), 'kind')
  assert.equal(requestErrorKey(validatePrivacyRequest({ kind: 'other', message: '' }).error), 'short')
  assert.equal(requestErrorKey(validatePrivacyRequest({ kind: 'other', message: 'x'.repeat(MESSAGE_MAX + 1) }).error), 'long')
  assert.equal(requestErrorKey('Something else'), null)
  assert.equal(requestErrorKey(undefined), null)
  for (const key of ['kind', 'short', 'long']) assert.equal(typeof enPrivacy.request.errors[key], 'string', key)
})

test('changeItems: a version the dictionary has is translated; a newer one falls back to legal.ts', async () => {
  const known = LEGAL_CHANGES[0]
  assert.deepEqual(changeItems(known), Object.values(enPrivacy.gate.changes[known.version]))
  await loadLanguage('el')
  try {
    const greek = changeItems(known)
    assert.equal(greek.length, Object.keys(enPrivacy.gate.changes[known.version]).length)
    assert.ok(greek.every((line) => /[α-ω]/i.test(line)), 'Greek items')
    const future = { version: '2099-01-01', summary: 'x', items: ['A new English line.'] }
    assert.deepEqual(changeItems(future), ['A new English line.'])
  } finally {
    await loadLanguage('en')
  }
})

test('the delete screen lists exactly what the deletion email does (DELETION_SCOPE)', () => {
  const scope = enSettings.deleteAccount.scope
  assert.deepEqual(Object.values(scope.deleted), DELETION_SCOPE.deleted)
  assert.deepEqual(Object.values(scope.stays), DELETION_SCOPE.stays)
  assert.deepEqual(Object.keys(elSettings.deleteAccount.scope.deleted), Object.keys(scope.deleted))
})
