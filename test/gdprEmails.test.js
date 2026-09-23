// The GDPR service notices (supabase/functions/_shared/gdprEmails.ts), the
// shared Resend sender (_shared/sendEmail.ts) and the one-source facts they
// quote (legal versions, deletion scope, contact addresses).
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  accountDeletedEmail, consentChangeEmail, dataExportEmail, formatDateTimeUTC, inactiveAccountDeletedEmail,
  inactivityWarningEmail, legalUpdateEmail, privacyReceiptEmail, requestDeadline,
} from '../supabase/functions/_shared/gdprEmails.ts'
import {
  DEFAULT_NOTICE_FROM, DEFAULT_ORIGIN, eachPaced, normalizeOrigin, sendEmail,
} from '../supabase/functions/_shared/sendEmail.ts'
import { DELETION_SCOPE } from '../supabase/functions/_shared/accountDeletion.ts'
import { LEGAL_CHANGES, LEGAL_VERSIONS, currentLegalChange } from '../supabase/functions/_shared/legal.ts'
import { PRIVACY_EMAIL, SUPPORT_EMAIL } from '../src/shared/lib/contact.js'

const ctx = { origin: 'https://dev.budgeer.com', privacyEmail: PRIVACY_EMAIL }
const EVIL = '<script>alert("x")</script> & \'q\''
const AT = new Date('2026-09-14T09:05:00Z')

const all = () => [
  legalUpdateEmail(ctx, { change: currentLegalChange(), privacy: true, terms: true }),
  accountDeletedEmail(ctx, { deletedAt: AT }),
  inactiveAccountDeletedEmail(ctx, { deletedAt: AT, warnedAt: new Date('2026-08-17T04:45:00Z') }),
  dataExportEmail(ctx, { lastAt: AT, count: 1 }),
  consentChangeEmail(ctx, { changedAt: AT, switches: { notify_digest: true, notify_email: false, notify_push: true } }),
  privacyReceiptEmail(ctx, { kindLabel: 'Restrict processing (Art. 18)', receivedAt: AT, message: 'Please restrict processing of my data.' }),
  inactivityWarningEmail(ctx, { deleteOn: '12 October 2026' }),
]

test('every notice has a subject, both bodies, the reason it was sent and the privacy contact', () => {
  for (const m of all()) {
    assert.ok(m.subject.length > 10, m.subject)
    assert.match(m.html, /^<!doctype html>/)
    assert.match(m.text, /^\S/)
    for (const body of [m.html, m.text]) {
      assert.match(body, /You’re getting this/, m.subject)
      assert.ok(body.includes(PRIVACY_EMAIL), m.subject)
      assert.ok(body.includes('https://dev.budgeer.com/email-mark.png') || body === m.text)
    }
    // Plain: no money — no currency signs or amounts.
    assert.doesNotMatch(m.text, /[€$£¥]|\b\d+[.,]\d{2}\b|EUR|USD/, m.subject)
  }
})

test('user text is escaped in the HTML and kept verbatim in the text', () => {
  const m = privacyReceiptEmail(ctx, { kindLabel: EVIL, receivedAt: AT, message: `Hi ${EVIL}` })
  assert.doesNotMatch(m.html, /<script>/)
  assert.match(m.html, /Hi &lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt; &amp; &#39;q&#39;/)
  assert.ok(m.text.includes(`Hi ${EVIL}`))
  assert.ok(m.text.includes(`Request: ${EVIL}`))
})

test('dates are UTC and the request deadline is one calendar month, clamped', () => {
  assert.equal(formatDateTimeUTC(new Date('2026-09-14T23:30:00Z')), '14 September 2026 at 23:30 UTC')
  assert.equal(requestDeadline(new Date('2026-01-31T12:00:00Z')).toISOString(), '2026-02-28T12:00:00.000Z')
  assert.equal(requestDeadline(new Date('2028-01-31T12:00:00Z')).toISOString(), '2028-02-29T12:00:00.000Z')
  assert.equal(requestDeadline(new Date('2026-12-15T00:00:00Z')).toISOString(), '2027-01-15T00:00:00.000Z')
  // Late evening UTC stays that UTC day, whatever TZ the tests run in.
  const m = privacyReceiptEmail(ctx, { kindLabel: 'Other', receivedAt: new Date('2026-09-30T23:30:00Z'), message: 'Hello there, a question.' })
  assert.ok(m.text.includes('We received your privacy request on 30 September 2026 at 23:30 UTC.'))
  assert.ok(m.text.includes('We’ll answer by 30 October 2026 at the latest'))
})

test('legal update email: which documents, effective date, summary, both links', () => {
  const change = { version: '2027-03-01', summary: 'We now use a new email provider.' }
  const both = legalUpdateEmail(ctx, { change, privacy: true, terms: true })
  assert.equal(both.subject, 'We’ve updated our Privacy Notice and Terms of Use')
  assert.ok(both.text.includes('applies from 1 March 2027'))
  assert.ok(both.text.includes('What’s changed: We now use a new email provider.'))
  assert.ok(both.text.includes('Privacy Notice: https://dev.budgeer.com/privacy'))
  assert.ok(both.text.includes('Terms of Use: https://dev.budgeer.com/terms'))
  assert.match(both.html, /href="https:\/\/dev\.budgeer\.com\/terms"/)
  assert.equal(legalUpdateEmail(ctx, { change, privacy: false, terms: true }).subject, 'We’ve updated our Terms of Use')
  assert.equal(legalUpdateEmail(ctx, { change, privacy: true, terms: false }).subject, 'We’ve updated our Privacy Notice')
})

test('the versions in force have an email summary', () => {
  const c = currentLegalChange()
  assert.ok(c && c.summary.length > 20)
  assert.equal(c.version, [LEGAL_VERSIONS.privacy, LEGAL_VERSIONS.terms].sort()[1])
  for (const entry of LEGAL_CHANGES) assert.ok(entry.summary && entry.items.length)
})

test('deletion emails list exactly the delete dialog’s scope', () => {
  for (const m of [accountDeletedEmail(ctx, { deletedAt: AT }), inactiveAccountDeletedEmail(ctx, { deletedAt: AT })]) {
    assert.ok(m.text.includes('deleted on 14 September 2026'))
    for (const line of [...DELETION_SCOPE.deleted, ...DELETION_SCOPE.stays]) assert.ok(m.text.includes(`- ${line}`), line)
    assert.ok(m.text.includes(DELETION_SCOPE.backups))
    assert.match(m.html, /<ul class="bb-body"/)
    assert.ok(m.html.includes('“Former member”'))
  }
  const idle = inactiveAccountDeletedEmail(ctx, { deletedAt: AT, warnedAt: new Date('2026-08-17T04:45:00Z') })
  assert.ok(idle.text.includes('hadn’t been used for 24 months. We emailed this address a warning on 17 August 2026.'))
  assert.doesNotMatch(inactiveAccountDeletedEmail(ctx, { deletedAt: AT }).text, /warning on/)
})

test('data download email: time, repeat count, what to do if it wasn’t you', () => {
  const one = dataExportEmail(ctx, { lastAt: AT, count: 1 })
  assert.ok(one.text.includes('was downloaded on 14 September 2026 at 09:05 UTC'))
  assert.ok(one.text.includes('change your password'))
  assert.ok(one.text.includes('https://dev.budgeer.com/settings/security'))
  assert.ok(dataExportEmail(ctx, { lastAt: AT, count: 3 }).text.includes('downloaded 3 times since our last email'))
})

test('consent email lists the final state of every switch and links to Settings → Privacy', () => {
  const m = consentChangeEmail(ctx, { changedAt: AT, switches: { notify_digest: false, notify_email: true, notify_push: false } })
  assert.ok(m.text.includes('- Weekly summary: off\n- Email notifications: on\n- Push notifications: off'))
  assert.ok(m.text.includes('changed on 14 September 2026 at 09:05 UTC'))
  assert.ok(m.text.includes('https://dev.budgeer.com/settings/privacy'))
})

test('contact addresses have one source, shared with the app', () => {
  assert.equal(PRIVACY_EMAIL, 'privacy@budgeer.com')
  assert.equal(SUPPORT_EMAIL, 'support@budgeer.com')
})

test('origin defaults to www and loses trailing slashes', () => {
  assert.equal(DEFAULT_ORIGIN, 'https://www.budgeer.com')
  assert.equal(normalizeOrigin(undefined), 'https://www.budgeer.com')
  assert.equal(normalizeOrigin('https://dev.budgeer.com//'), 'https://dev.budgeer.com')
  assert.equal(DEFAULT_NOTICE_FROM, 'Budgeer <no-reply@budgeer.com>')
})

test('sendEmail posts one message to Resend, with the sender’s Reply-To, and never throws', async (t) => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push([url, init])
    return new Response(JSON.stringify({ id: 'em_1' }), { status: 200 })
  })
  const sender = { apiKey: 'k', from: 'Budgeer <no-reply@budgeer.com>', replyTo: PRIVACY_EMAIL }
  const res = await sendEmail(sender, { to: 'alex@example.com', subject: 'S', html: '<p>h</p>', text: 't' })
  assert.deepEqual(res, { ok: true, status: 200, id: 'em_1' })
  const [url, init] = calls[0]
  assert.equal(url, 'https://api.resend.com/emails')
  assert.equal(init.headers.Authorization, 'Bearer k')
  assert.deepEqual(JSON.parse(init.body), {
    from: 'Budgeer <no-reply@budgeer.com>', to: ['alex@example.com'], subject: 'S', html: '<p>h</p>', text: 't',
    reply_to: PRIVACY_EMAIL,
  })
  // A per-message Reply-To wins; none at all → no field.
  await sendEmail(sender, { to: 'a@b.c', subject: 'S', html: 'h', text: 't', replyTo: 'user@example.com' })
  assert.equal(JSON.parse(calls[1][1].body).reply_to, 'user@example.com')
  await sendEmail({ apiKey: 'k', from: 'x' }, { to: 'a@b.c', subject: 'S', html: 'h', text: 't' })
  assert.equal('reply_to' in JSON.parse(calls[2][1].body), false)

  t.mock.method(console, 'error', () => {})
  t.mock.method(globalThis, 'fetch', async () => new Response('nope', { status: 422 }))
  assert.deepEqual(await sendEmail(sender, { to: 'a@b.c', subject: 'S', html: 'h', text: 't' }), { ok: false, status: 422 })
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('offline') })
  assert.deepEqual(await sendEmail(sender, { to: 'a@b.c', subject: 'S', html: 'h', text: 't' }), { ok: false, status: 0 })
})

test('eachPaced runs one at a time, in order', async () => {
  const seen = []
  let running = 0
  await eachPaced([1, 2, 3], async (x) => {
    running += 1
    assert.equal(running, 1)
    await new Promise((r) => setTimeout(r, 1))
    seen.push(x)
    running -= 1
  }, 0)
  assert.deepEqual(seen, [1, 2, 3])
})
