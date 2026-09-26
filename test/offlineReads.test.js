import { test } from 'node:test'
import assert from 'node:assert/strict'
import { offlineReadRpc, offlineReadKey, requestUser } from '../src/shared/lib/offlineReads.js'

test('offlineReadRpc: allowlisted read RPCs via POST', () => {
  assert.equal(offlineReadRpc('POST', '/rest/v1/rpc/my_transactions'), 'my_transactions')
  assert.equal(offlineReadRpc('POST', '/rest/v1/rpc/group_ledger'), 'group_ledger')
  // The device-made statement's reads, so an export works offline too.
  assert.equal(offlineReadRpc('POST', '/rest/v1/rpc/latest_fx_rates'), 'latest_fx_rates')
})

test('offlineReadRpc: writes, anon preview, GETs and odd paths are never cached', () => {
  assert.equal(offlineReadRpc('POST', '/rest/v1/rpc/save_transactions'), null)
  assert.equal(offlineReadRpc('POST', '/rest/v1/rpc/add_settlement'), null)
  assert.equal(offlineReadRpc('POST', '/rest/v1/rpc/group_preview'), null)
  assert.equal(offlineReadRpc('GET', '/rest/v1/rpc/my_transactions'), null)
  assert.equal(offlineReadRpc('POST', '/rest/v1/rpc/my_transactions/x'), null)
  assert.equal(offlineReadRpc('POST', '/rest/v1/transactions'), null)
})

test('offlineReadKey: distinct per arguments and per user, stable otherwise', () => {
  const o = 'https://x.supabase.co'
  const a = offlineReadKey(o, 'my_transactions', '{"p_kind":"expense"}', 'u1')
  assert.equal(a, offlineReadKey(o, 'my_transactions', '{"p_kind":"expense"}', 'u1'))
  assert.notEqual(a, offlineReadKey(o, 'my_transactions', '{"p_kind":"income"}', 'u1'))
  assert.notEqual(a, offlineReadKey(o, 'my_transactions', '{"p_kind":"expense"}', 'u2'))
  assert.ok(a.startsWith(`${o}/__offline-rpc/my_transactions?`))
})

test('requestUser: user id from a bearer JWT, stable across token refreshes', () => {
  const jwt = (claims) => `Bearer h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.sig`
  assert.equal(requestUser(jwt({ sub: 'u-1', exp: 1 })), 'u-1')
  assert.equal(requestUser(jwt({ sub: 'u-1', exp: 2 })), 'u-1')
  assert.equal(requestUser(jwt({ role: 'anon' })), '')
  assert.equal(requestUser('Bearer not-a-jwt'), '')
  assert.equal(requestUser(undefined), '')
})
