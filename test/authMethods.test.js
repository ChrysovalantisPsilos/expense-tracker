import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hasPasswordIdentity, toPasskeyList } from '../src/features/settings/authMethods.js'

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
