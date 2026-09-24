import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  hasPasswordIdentity, toPasskeyList, hasPassword, signInMethods, googleDisconnectBlock,
  linkErrorMessage, redirectError,
} from '../src/features/settings/authMethods.js'

test('hasPasswordIdentity: email identity has a password', () => {
  assert.equal(hasPasswordIdentity({ app_metadata: { providers: ['email'] } }), true)
  assert.equal(hasPasswordIdentity({ app_metadata: { providers: ['google', 'email'] } }), true)
  assert.equal(hasPasswordIdentity({ app_metadata: { provider: 'email' } }), true)
})

test('hasPasswordIdentity: OAuth-only accounts have no password', () => {
  assert.equal(hasPasswordIdentity({ app_metadata: { providers: ['google'] } }), false)
  assert.equal(hasPasswordIdentity({ app_metadata: { provider: 'google' } }), false)
})

test('hasPasswordIdentity: unknown providers default to requiring a password', () => {
  assert.equal(hasPasswordIdentity({ app_metadata: {} }), true)
  assert.equal(hasPasswordIdentity({}), true)
  assert.equal(hasPasswordIdentity(null), true)
})

test('toPasskeyList: accepts a bare array or a { passkeys } object', () => {
  const pk = [{ id: 'a' }]
  assert.deepEqual(toPasskeyList(pk), pk)
  assert.deepEqual(toPasskeyList({ passkeys: pk }), pk)
  assert.deepEqual(toPasskeyList({}), [])
  assert.deepEqual(toPasskeyList(null), [])
})

const emailUser = { email: 'a@x.test', app_metadata: { providers: ['email'] } }
const googleUser = { email: 'g@x.test', app_metadata: { providers: ['google'] } }
const EMAIL_ID = { provider: 'email', identity_data: { email: 'a@x.test' } }
const GOOGLE_ID = { provider: 'google', identity_data: { email: 'g@gmail.test' } }

test('hasPassword: an email identity, or a Google account that set one', () => {
  assert.equal(hasPassword(emailUser), true)
  assert.equal(hasPassword(googleUser), false)
  assert.equal(hasPassword({ ...googleUser, user_metadata: { password_set: true } }), true)
  assert.equal(hasPassword({ ...googleUser, user_metadata: { password_set: 'yes' } }), false)
})

test('signInMethods: rows for password, Google and (when supported) passkeys', () => {
  const m = signInMethods({ user: emailUser, identities: [EMAIL_ID], passkeys: [{ id: 'p' }] })
  assert.deepEqual(m.map((x) => [x.key, x.connected, x.detail]), [
    ['password', true, 'a@x.test'], ['google', false, 'Not connected'], ['passkeys', true, '1 passkey'],
  ])
  const g = signInMethods({ user: googleUser, identities: [GOOGLE_ID], passkeys: null })
  assert.deepEqual(g.map((x) => [x.key, x.connected, x.detail]), [
    ['password', false, 'No password yet'], ['google', true, 'g@gmail.test'],
  ])
  assert.equal(g[1].identity, GOOGLE_ID)
  assert.equal(signInMethods({ user: emailUser, identities: [], passkeys: [] })[2].detail, 'None yet')
  assert.equal(signInMethods({ user: emailUser, identities: [], passkeys: [1, 2] })[2].detail, '2 passkeys')
})

test('signInMethods: while identities load, the providers stand in', () => {
  const both = { ...emailUser, app_metadata: { providers: ['email', 'google'] } }
  assert.equal(signInMethods({ user: both, identities: null }).find((x) => x.key === 'google').connected, true)
  assert.equal(signInMethods({ user: emailUser, identities: null }).find((x) => x.key === 'google').connected, false)
})

test('googleDisconnectBlock: never the last sign-in identity', () => {
  assert.equal(googleDisconnectBlock({ user: emailUser, identities: [EMAIL_ID, GOOGLE_ID] }), null)
  assert.match(googleDisconnectBlock({ user: googleUser, identities: [GOOGLE_ID] }), /only way to sign in/)
  assert.match(googleDisconnectBlock({
    user: { ...googleUser, user_metadata: { password_set: true } }, identities: [GOOGLE_ID],
  }), /stays connected/)
  assert.match(googleDisconnectBlock({ user: emailUser, identities: [EMAIL_ID] }), /isn’t connected/)
  assert.match(googleDisconnectBlock({ user: emailUser, identities: null }), /loading/)
})

test('linkErrorMessage: clear words for the known failures', () => {
  assert.match(linkErrorMessage({ code: 'manual_linking_disabled', message: 'Manual linking is disabled' }), /isn’t switched on/)
  assert.match(linkErrorMessage({ code: 'identity_already_exists' }), /another Budgeer account/)
  // Supabase's and Google's own text never shows: the fallback does.
  assert.match(linkErrorMessage({ message: 'Boom' }), /wasn’t connected/)
  assert.match(linkErrorMessage({ code: 'access_denied', description: 'Denied' }), /wasn’t connected/)
  assert.equal(linkErrorMessage({ message: 'Boom' }, 'Google is still connected.'), 'Google is still connected.')
  assert.match(linkErrorMessage(null), /wasn’t connected/)
})

test('redirectError: reads ?error=… or #error=…', () => {
  assert.equal(redirectError('?linked=google', ''), null)
  assert.deepEqual(
    redirectError('?error=server_error&error_code=identity_already_exists&error_description=Identity+is+already+linked', ''),
    { code: 'identity_already_exists', description: 'Identity is already linked' })
  assert.deepEqual(redirectError('', '#error=access_denied&error_description=User%20cancelled'),
    { code: 'access_denied', description: 'User cancelled' })
})
