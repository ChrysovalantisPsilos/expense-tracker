import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  REST_CACHE, RPC_CACHE, REST_CACHE_LIMITS, RPC_CACHE_LIMITS, NETWORK_TIMEOUT_SECONDS,
  clearUserDataCaches, isLegacyRpcKey,
} from '../src/shared/lib/userDataCaches.js'
import { offlineReadKey } from '../src/shared/lib/offlineReads.js'
import { STORAGE_KEYS } from '../src/shared/lib/keys.js'

test('clearUserDataCaches deletes both read caches, the expiry timestamps and the legal acceptance', async () => {
  const deleted = []
  const dbs = []
  const removed = []
  await clearUserDataCaches({
    caches: { delete: async (name) => { deleted.push(name); return true } },
    indexedDB: { deleteDatabase: (name) => { dbs.push(name) } },
    localStorage: { removeItem: (key) => { removed.push(key) } },
  })
  assert.deepEqual(deleted.sort(), [REST_CACHE, RPC_CACHE].sort())
  assert.deepEqual(dbs, ['workbox-expiration'])
  assert.deepEqual(removed, [STORAGE_KEYS.legalAccepted])
})

test('clearUserDataCaches never throws (no Cache API, failing deletes, blocked IndexedDB)', async () => {
  await clearUserDataCaches({})
  await clearUserDataCaches({
    caches: { delete: async () => { throw new Error('SecurityError') } },
    indexedDB: { deleteDatabase: () => { throw new Error('blocked') } },
    localStorage: { removeItem: () => { throw new Error('SecurityError') } },
  })
})

test('both caches are bounded, and reads wait for the network only so long', () => {
  for (const limits of [REST_CACHE_LIMITS, RPC_CACHE_LIMITS]) {
    assert.ok(limits.maxEntries > 0 && limits.maxEntries <= 200)
    assert.ok(limits.maxAgeSeconds > 0 && limits.maxAgeSeconds <= 60 * 60 * 24)
  }
  assert.ok(NETWORK_TIMEOUT_SECONDS > 0 && NETWORK_TIMEOUT_SECONDS <= 10)
  assert.notEqual(REST_CACHE, RPC_CACHE)
})

test('isLegacyRpcKey spots the synthetic RPC keys, not REST reads', () => {
  const key = offlineReadKey('https://x.supabase.co', 'my_transactions', '{}', 'u1')
  assert.equal(isLegacyRpcKey(key), true)
  assert.equal(isLegacyRpcKey('https://x.supabase.co/rest/v1/profiles?select=*'), false)
})
