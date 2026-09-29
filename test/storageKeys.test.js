// Browser storage vs the Privacy Notice: every key the app writes lives in
// STORAGE_KEYS (shared/lib/keys.js), and the notice's "Storage on your device"
// list names each one, plus each service-worker cache (userDataCaches.js).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RETIRED_STORAGE_KEYS, STORAGE_KEYS } from '../src/shared/lib/keys.js'

const root = fileURLToPath(new URL('..', import.meta.url))
const read = (p) => readFileSync(join(root, p), 'utf8')
const sources = (dir) => readdirSync(join(root, dir), { recursive: true })
  .filter((f) => /\.(js|jsx)$/.test(f))
  .map((f) => ({ path: join(dir, f), text: read(join(dir, f)) }))

const notice = read('src/features/privacy/Privacy.jsx')

test('the Privacy Notice names every storage key and service-worker cache', () => {
  for (const name of Object.keys(STORAGE_KEYS)) {
    assert.ok(notice.includes(`{STORAGE_KEYS.${name}}`), `Privacy.jsx doesn't list STORAGE_KEYS.${name}`)
  }
  // A retired key can still sit on a device until the app deletes it.
  for (const name of Object.keys(RETIRED_STORAGE_KEYS)) {
    assert.ok(notice.includes(`{RETIRED_STORAGE_KEYS.${name}}`), `Privacy.jsx doesn't list RETIRED_STORAGE_KEYS.${name}`)
  }
  for (const name of ['REST_CACHE', 'RPC_CACHE', 'EXPIRATION_DB']) {
    assert.ok(notice.includes(`{${name}}`), `Privacy.jsx doesn't list ${name}`)
  }
})

test('storage keys come from STORAGE_KEYS, never a literal at the call site', () => {
  const literalKey = /\b(localStorage|sessionStorage)\.(getItem|setItem|removeItem)\(\s*['"`]/
  const ownPrefix = /['"`]budge(er)?:/
  const values = new Set(Object.values(STORAGE_KEYS))
  for (const { path, text } of sources('src')) {
    assert.doesNotMatch(text, literalKey, `${path}: use a STORAGE_KEYS entry`)
    assert.doesNotMatch(text, /\bindexedDB\.open\(/, `${path}: a new IndexedDB store needs listing in the notice`)
    if (!path.endsWith('keys.js')) assert.doesNotMatch(text, ownPrefix, `${path}: move the key into STORAGE_KEYS`)
  }
  // The boot script can't import keys.js; any key it reads must still be one of ours.
  for (const { path, text } of sources('public')) {
    for (const [, key] of text.matchAll(/Storage\.getItem\(\s*['"]([^'"]+)['"]/g)) {
      assert.ok(values.has(key), `${path}: ${key} isn't in STORAGE_KEYS`)
    }
  }
})

test('the service worker names its caches through userDataCaches.js', () => {
  const sw = read('src/sw.js')
  assert.doesNotMatch(sw, /caches\.open\(\s*['"`]/)
  assert.doesNotMatch(sw, /cacheName:\s*['"`]/)
})
