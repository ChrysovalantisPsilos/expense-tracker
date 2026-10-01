import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  hasPasswordIdentity, toPasskeyList, hasPassword, signInMethods, disconnectBlock, appleProfileName,
  linkErrorMessage, redirectError, newPasswordError, deleteAccountCheck, deletionScope, DELETE_CONFIRM_WORD,
} from '../src/features/settings/authMethods.js'
import en from '../src/locales/en/index.js'

test('hasPasswordIdentity: an email identity has a password, OAuth-only has none, unknown defaults to one', () => {
  assert.equal(hasPasswordIdentity({ app_metadata: { providers: ['email'] } }), true)
  assert.equal(hasPasswordIdentity({ app_metadata: { providers: ['google', 'email'] } }), true)
  assert.equal(hasPasswordIdentity({ app_metadata: { provider: 'email' } }), true)
  assert.equal(hasPasswordIdentity({ app_metadata: { providers: ['google'] } }), false)
  assert.equal(hasPasswordIdentity({ app_metadata: { provider: 'google' } }), false)
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
const appleUser = { email: 'r@privaterelay.appleid.com', app_metadata: { providers: ['apple'] } }
const APPLE_ID = { provider: 'apple', identity_data: { email: 'r@privaterelay.appleid.com' } }

test('hasPassword: an email identity, or a Google account that set one', () => {
  assert.equal(hasPassword(emailUser), true)
  assert.equal(hasPassword(googleUser), false)
  assert.equal(hasPassword({ ...googleUser, user_metadata: { password_set: true } }), true)
  assert.equal(hasPassword({ ...googleUser, user_metadata: { password_set: 'yes' } }), false)
})

test('signInMethods: rows for password, Google, Apple and (when supported) passkeys', () => {
  const m = signInMethods({ user: emailUser, identities: [EMAIL_ID], passkeys: [{ id: 'p' }] })
  assert.deepEqual(m.map((x) => [x.key, x.connected, x.detail]), [
    ['password', true, 'a@x.test'], ['google', false, 'Not connected'], ['apple', false, 'Not connected'],
    ['passkeys', true, '1 passkey'],
  ])
  const g = signInMethods({ user: googleUser, identities: [GOOGLE_ID], passkeys: null })
  assert.deepEqual(g.map((x) => [x.key, x.connected, x.detail]), [
    ['password', false, 'No password yet'], ['google', true, 'g@gmail.test'], ['apple', false, 'Not connected'],
  ])
  assert.equal(g[1].identity, GOOGLE_ID)
  const a = signInMethods({ user: appleUser, identities: [APPLE_ID], passkeys: null })
  assert.deepEqual(a.map((x) => [x.key, x.connected, x.label]), [
    ['password', false, 'Email & password'], ['google', false, 'Google'], ['apple', true, 'Apple'],
  ])
  assert.equal(a[2].identity, APPLE_ID)
  assert.equal(signInMethods({ user: emailUser, identities: [], passkeys: [] })[3].detail, 'None yet')
  assert.equal(signInMethods({ user: emailUser, identities: [], passkeys: [1, 2] })[3].detail, '2 passkeys')
})

test('signInMethods: while identities load, the providers stand in', () => {
  const both = { ...emailUser, app_metadata: { providers: ['email', 'google'] } }
  assert.equal(signInMethods({ user: both, identities: null }).find((x) => x.key === 'google').connected, true)
  assert.equal(signInMethods({ user: emailUser, identities: null }).find((x) => x.key === 'google').connected, false)
  assert.equal(signInMethods({ user: appleUser, identities: null }).find((x) => x.key === 'apple').connected, true)
})

test('disconnectBlock: never the last sign-in identity, for Google and Apple', () => {
  assert.equal(disconnectBlock({ user: emailUser, identities: [EMAIL_ID, GOOGLE_ID] }), null)
  assert.match(disconnectBlock({ user: googleUser, identities: [GOOGLE_ID] }), /Google is your only way to log in/)
  assert.match(disconnectBlock({
    user: { ...googleUser, user_metadata: { password_set: true } }, identities: [GOOGLE_ID],
  }), /created with Google, so Google stays connected/)
  assert.match(disconnectBlock({ user: emailUser, identities: [EMAIL_ID] }), /Google isn’t connected/)
  assert.match(disconnectBlock({ user: emailUser, identities: null }), /loading/)
  assert.equal(disconnectBlock({ user: appleUser, identities: [APPLE_ID, GOOGLE_ID], provider: 'apple' }), null)
  assert.match(disconnectBlock({ user: appleUser, identities: [APPLE_ID], provider: 'apple' }), /Apple is your only way/)
  assert.match(disconnectBlock({
    user: { ...appleUser, user_metadata: { password_set: true } }, identities: [APPLE_ID], provider: 'apple',
  }), /created with Apple/)
  assert.match(disconnectBlock({ user: emailUser, identities: [EMAIL_ID, GOOGLE_ID], provider: 'apple' }), /Apple isn’t connected/)
})

test('linkErrorMessage: clear words for the known failures', () => {
  assert.match(linkErrorMessage({ code: 'manual_linking_disabled', message: 'Manual linking is disabled' }), /isn’t switched on/)
  assert.match(linkErrorMessage({ code: 'identity_already_exists' }), /Google account already belongs to another Budgeer account/)
  assert.match(linkErrorMessage({ code: 'identity_already_exists' }, null, 'apple'), /Apple ID already belongs/)
  // Supabase's, Google's and Apple's own text never shows: the fallback does.
  assert.match(linkErrorMessage({ message: 'Boom' }), /Google wasn’t connected/)
  assert.match(linkErrorMessage({ message: 'Boom' }, null, 'apple'), /Apple wasn’t connected/)
  assert.match(linkErrorMessage({ code: 'access_denied', description: 'Denied' }), /wasn’t connected/)
  assert.equal(linkErrorMessage({ message: 'Boom' }, 'Google is still connected.'), 'Google is still connected.')
  assert.match(linkErrorMessage(null), /wasn’t connected/)
})

test('appleProfileName: Apple\'s name only over the default one, cleaned', () => {
  const email = 'x7k2@privaterelay.appleid.com'
  assert.equal(appleProfileName({ displayName: 'x7k2', email, fullName: 'Maria Papadopoulou' }), 'Maria Papadopoulou')
  assert.equal(appleProfileName({ displayName: null, email, fullName: '  Maria\nP ' }), 'Maria P')
  assert.equal(appleProfileName({ displayName: 'Maria', email, fullName: 'Maria Papadopoulou' }), null)
  assert.equal(appleProfileName({ displayName: 'x7k2', email, fullName: '   ' }), null)
  assert.equal(appleProfileName({ displayName: 'x7k2', email, fullName: null }), null)
  assert.equal(appleProfileName({ displayName: 'Ann', email: 'Ann@x.test', fullName: 'Ann' }), null)
  assert.equal(appleProfileName({ displayName: 'x7k2', email, fullName: 'A'.repeat(80) }).length, 60)
})

test('newPasswordError: the sign-up rules first, then the two fields matching', () => {
  assert.match(newPasswordError('short1', 'short1'), /8/)
  assert.equal(newPasswordError('longer-pass1', 'longer-pass1'), null)
  assert.equal(newPasswordError('longer-pass1', 'longer-pass2'), 'New passwords don’t match.')
  assert.equal(newPasswordError('longer-pass1', 'other', 'auth:password.mismatch'), en.auth.password.mismatch)
})

test('deleteAccountCheck: the password for an email account, else a recent sign-in and DELETE', () => {
  const pw = deleteAccountCheck({ user: emailUser, recent: false, value: '' })
  assert.deepEqual(pw, { password: true, needsReauth: false, canSubmit: false,
    label: 'Enter your password to confirm', placeholder: 'Your password' })
  assert.equal(deleteAccountCheck({ user: emailUser, recent: false, value: 'x' }).canSubmit, true)
  const stale = deleteAccountCheck({ user: googleUser, recent: false, value: 'DELETE' })
  assert.equal(stale.needsReauth, true)
  assert.equal(stale.canSubmit, false)
  const fresh = deleteAccountCheck({ user: googleUser, recent: true, value: ' delete ' })
  assert.deepEqual(fresh, { password: false, needsReauth: false, canSubmit: true,
    label: 'Type DELETE to confirm', placeholder: DELETE_CONFIRM_WORD })
  assert.equal(deleteAccountCheck({ user: googleUser, recent: true, value: 'DELET' }).canSubmit, false)
})

test('deletionScope: the deletion email\'s lists, in the app\'s language', () => {
  assert.deepEqual(deletionScope(), {
    deleted: Object.values(en.settings.deleteAccount.scope.deleted),
    stays: Object.values(en.settings.deleteAccount.scope.stays),
  })
})

test('redirectError: reads ?error=… or #error=…', () => {
  assert.equal(redirectError('?linked=google', ''), null)
  assert.deepEqual(
    redirectError('?error=server_error&error_code=identity_already_exists&error_description=Identity+is+already+linked', ''),
    { code: 'identity_already_exists', description: 'Identity is already linked' })
  assert.deepEqual(redirectError('', '#error=access_denied&error_description=User%20cancelled'),
    { code: 'access_denied', description: 'User cancelled' })
})
