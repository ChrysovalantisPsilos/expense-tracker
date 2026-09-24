// The service worker's caches of decrypted Supabase reads, shared by the
// worker (src/sw.js, which fills them) and the app (AuthProvider, which wipes
// them on any sign-out). Pure module: the Cache/IndexedDB objects are passed
// in, so the unit tests can hand it fakes.

// GET /rest/v1 responses (workbox NetworkFirst + ExpirationPlugin).
export const REST_CACHE = 'supabase-rest'
// POST read RPCs, filed by hand under synthetic GET keys (offlineReads.js).
export const RPC_CACHE = 'supabase-rpc'

// How long a read waits for the network before falling back to the cache.
export const NETWORK_TIMEOUT_SECONDS = 5

// Bounds for each cache: entries past a day, or beyond the newest N, go.
export const REST_CACHE_LIMITS = { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 }
export const RPC_CACHE_LIMITS = { maxEntries: 150, maxAgeSeconds: 60 * 60 * 24 }

// Workbox keeps each cached URL's timestamp here (the RPC keys carry the user
// id and the call's arguments), so it goes with the caches.
const EXPIRATION_DB = 'workbox-expiration'

// Delete everything cached from the signed-in session. Never throws: a
// sign-out must not fail because storage is unavailable. The IndexedDB delete
// isn't awaited (it waits for the worker to close its connection).
export async function clearUserDataCaches({ caches, indexedDB } = globalThis) {
  try { indexedDB?.deleteDatabase(EXPIRATION_DB) } catch { /* unavailable */ }
  if (!caches) return
  await Promise.all([REST_CACHE, RPC_CACHE].map((name) => caches.delete(name).catch(() => false)))
}

// Before the RPC reads had their own cache they were filed in REST_CACHE,
// where nothing expires them: the worker drops these keys on activation.
export const isLegacyRpcKey = (url) => new URL(url).pathname.startsWith('/__offline-rpc/')
