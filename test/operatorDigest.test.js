// The operator's daily sign-up digest (supabase/functions/_shared/operatorDigest.ts),
// its sender (_shared/sendEmail.ts operatorSender) and the SQL it relies on (0079).
import test from 'node:test'
import assert from 'node:assert/strict'
import { signupDigestEmail, signupsLabel } from '../supabase/functions/_shared/operatorDigest.ts'
import { DEFAULT_OPERATOR_FROM, operatorSender } from '../supabase/functions/_shared/sendEmail.ts'
import { latestSql } from './migrations.js'

const ORIGIN = 'https://www.budgeer.com'

test('pluralises the sign-ups: 1 new sign-up, 3 new sign-ups', () => {
  assert.equal(signupsLabel(1), '1 new sign-up')
  assert.equal(signupsLabel(3), '3 new sign-ups')
  assert.equal(signupsLabel(1204), '1,204 new sign-ups')
})

test('subject, heading and body carry the day, the count and the total', () => {
  const m = signupDigestEmail(ORIGIN, { day: '2026-09-23', newCount: 3, total: 1204 })
  assert.equal(m.subject, 'Budgeer: 3 new sign-ups yesterday')
  for (const body of [m.html, m.text]) {
    assert.ok(body.includes('3 new sign-ups yesterday'))
    assert.ok(body.includes('23 September 2026 (UTC): 3 new sign-ups · 1,204 accounts in total.'))
    assert.ok(body.includes('no names, email addresses or account ids'))
  }
  assert.match(m.html, /^<!doctype html>/)
  assert.ok(m.html.includes(`${ORIGIN}/email-mark.png`))
})

test('singular forms for one sign-up and one account', () => {
  const m = signupDigestEmail(ORIGIN, { day: '2026-01-01', newCount: 1, total: 1 })
  assert.equal(m.subject, 'Budgeer: 1 new sign-up yesterday')
  assert.ok(m.text.includes('1 January 2026 (UTC): 1 new sign-up · 1 account in total.'))
  assert.ok(!/sign-ups|accounts/.test(m.text.split('\n\n').slice(0, 2).join(' ')))
})

test('no personal data: the template only takes a day and two numbers', () => {
  const m = signupDigestEmail(ORIGIN, { day: '2026-09-23', newCount: 2, total: 10 })
  for (const body of [m.subject, m.html, m.text]) {
    // No email address and no account id anywhere in the email.
    assert.ok(!/[\w.+-]+@[\w-]+\.[\w.]+/.test(body.replace(/<[^>]+>/g, ' ')), 'an address leaked')
    assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(body), 'an id leaked')
  }
})

test('operator sender: no-reply@budgeer.com by default, OPERATOR_FROM overrides, dormant without a key', () => {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'Deno')
  const prev = globalThis.Deno
  const env = (vars) => { globalThis.Deno = { env: { get: (k) => vars[k] } } }
  try {
    assert.equal(DEFAULT_OPERATOR_FROM, 'Budgeer <no-reply@budgeer.com>')
    env({})
    assert.equal(operatorSender(), null)
    env({ RESEND_API_KEY: 'k' })
    assert.deepEqual(operatorSender(), { apiKey: 'k', from: DEFAULT_OPERATOR_FROM })
    env({ RESEND_API_KEY: 'k', OPERATOR_FROM: 'Ops <ops@budgeer.com>' })
    assert.equal(operatorSender().from, 'Ops <ops@budgeer.com>')
  } finally {
    if (had) globalThis.Deno = prev
    else delete globalThis.Deno
  }
})

test('SQL: the digest counts yesterday in UTC and only aggregates', () => {
  const sql = latestSql('signup_digest')
  assert.match(sql, /now\(\) at time zone 'utc'\)::date - 1/)
  assert.match(sql, /count\(\*\)/)
  assert.ok(!/\bemail\b/.test(sql), 'signup_digest must not read addresses')
  assert.match(latestSql('operator_signup_email'), /name = 'operator_signup_email'/)
})
