// The recent-sign-in rule for dangerous account actions (_shared/reauth.ts),
// shared by the delete-account edge function and the app.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  REAUTH_WINDOW_SECONDS, REAUTH_REQUIRED, reauthMessage, jwtClaims, signedInAt, isRecentSignIn,
} from '../supabase/functions/_shared/reauth.ts'

const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url')
const jwt = (claims) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(claims)}.sig`
const NOW = Date.UTC(2026, 8, 24, 12, 0, 0)
const s = (msAgo) => Math.floor((NOW - msAgo) / 1000)
const MIN = 60 * 1000

test('jwtClaims reads the payload of a token or a Bearer header; junk is null', () => {
  const t = jwt({ sub: 'u1', name: 'Zoë' })
  assert.deepEqual(jwtClaims(t), { sub: 'u1', name: 'Zoë' })
  assert.deepEqual(jwtClaims(`Bearer ${t}`), { sub: 'u1', name: 'Zoë' })
  const notAnObject = `x.${Buffer.from('[1]').toString('base64url')}.y`
  for (const bad of [null, undefined, '', 'Bearer ', 'abc', 'a.!!!.c', 'a.bm90IGpzb24.c', notAnObject]) {
    assert.equal(jwtClaims(bad), null, String(bad))
  }
})

test('signedInAt: the newest amr timestamp (a refresh keeps it), else iat', () => {
  assert.equal(signedInAt({ iat: 500, amr: [{ method: 'oauth', timestamp: 100 }, { method: 'webauthn', timestamp: 300 }] }), 300)
  assert.equal(signedInAt({ iat: 500, amr: [] }), 500)
  assert.equal(signedInAt({ iat: 500 }), 500)
  assert.equal(signedInAt({ amr: [{ method: 'password' }] }), null)
  assert.equal(signedInAt(null), null)
})

test('isRecentSignIn: within the window only — a refreshed token of an old sign-in is not recent', () => {
  assert.equal(REAUTH_WINDOW_SECONDS, 600)
  const fresh = jwt({ iat: s(0), amr: [{ method: 'oauth', timestamp: s(2 * MIN) }] })
  const stale = jwt({ iat: s(1 * MIN), amr: [{ method: 'oauth', timestamp: s(3 * 60 * MIN) }] })
  assert.equal(isRecentSignIn(fresh, NOW), true)
  assert.equal(isRecentSignIn(`Bearer ${fresh}`, NOW), true)
  assert.equal(isRecentSignIn(stale, NOW), false)
  assert.equal(isRecentSignIn(jwt({ amr: [{ method: 'password', timestamp: s(10 * MIN + 1000) }] }), NOW), false)
  assert.equal(isRecentSignIn(jwt({ amr: [{ method: 'password', timestamp: s(10 * MIN - 1000) }] }), NOW), true)
  // Unreadable, missing, or far in the future: not recent.
  assert.equal(isRecentSignIn(null, NOW), false)
  assert.equal(isRecentSignIn('garbage', NOW), false)
  assert.equal(isRecentSignIn(jwt({ amr: [{ method: 'password', timestamp: s(-10 * MIN) }] }), NOW), false)
})

test('the reauth error code and copy', () => {
  assert.equal(REAUTH_REQUIRED, 'reauth_required')
  assert.equal(reauthMessage('add a passkey'), 'For your security, please sign in again to add a passkey.')
})
