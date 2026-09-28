// Web vs the iOS app (src/shared/lib/platform.js): the gate every native-only
// behaviour sits behind, the origin for shared links, and the iOS build's
// environment check. Plus: the website's code never reaches for a native
// plugin outside that gate.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { isNative, nativeBuildError, siteOrigin } from '../src/shared/lib/platform.js'
import { LIVE, TEST } from '../src/shared/lib/environment.js'

const native = { Capacitor: { isNativePlatform: () => true }, location: { origin: 'capacitor://localhost' } }
const web = { location: { origin: 'https://dev.budgeer.com' } }

test('isNative only when Capacitor says so', () => {
  assert.equal(isNative(native), true)
  assert.equal(isNative(web), false)
  assert.equal(isNative({}), false)
  assert.equal(isNative(undefined), false)
  // Capacitor's web runtime (a plain browser) answers false.
  assert.equal(isNative({ Capacitor: { isNativePlatform: () => false } }), false)
  assert.equal(isNative({ Capacitor: {} }), false)
  // A page can't fake it with a truthy non-boolean.
  assert.equal(isNative({ Capacitor: { isNativePlatform: () => 'yes' } }), false)
  // Under node (the tests), as on the website: not native.
  assert.equal(isNative(), false)
})

test('shared links use the site, never capacitor://localhost', () => {
  assert.equal(siteOrigin(web, TEST), 'https://dev.budgeer.com')
  assert.equal(siteOrigin({ location: { origin: 'http://localhost:5173' } }, LIVE), 'http://localhost:5173')
  assert.equal(siteOrigin(native, TEST), 'https://dev.budgeer.com')
  assert.equal(siteOrigin(native, LIVE), 'https://www.budgeer.com')
})

test('the iOS builds need their own env file, for the right project', () => {
  const dev = { VITE_SUPABASE_URL: 'https://ctvdljzybbujuywppixo.supabase.co', VITE_SUPABASE_ANON_KEY: 'k' }
  const prod = { VITE_SUPABASE_URL: 'https://tuxfpylowcxazinqtrzx.supabase.co', VITE_SUPABASE_ANON_KEY: 'k' }
  assert.equal(nativeBuildError('ios-dev', dev), null)
  assert.equal(nativeBuildError('ios-prod', prod), null)
  assert.match(nativeBuildError('ios-dev', prod), /wrong Supabase project/)
  assert.match(nativeBuildError('ios-prod', dev), /wrong Supabase project/)
  assert.match(nativeBuildError('ios-dev', { VITE_SUPABASE_URL: 'https://someoneelse.supabase.co', VITE_SUPABASE_ANON_KEY: 'k' }), /wrong/)
  assert.match(nativeBuildError('ios-dev', {}), /needs VITE_SUPABASE_URL/)
  assert.match(nativeBuildError('ios-prod', { VITE_SUPABASE_URL: prod.VITE_SUPABASE_URL }), /needs/)
  // The _DEV pair is the website's; the app reads the plain names.
  assert.match(nativeBuildError('ios-dev', { VITE_SUPABASE_URL_DEV: dev.VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY_DEV: 'k' }), /needs/)
  // The website's builds are never checked.
  for (const mode of ['production', 'development', 'test', undefined]) assert.equal(nativeBuildError(mode, {}), null)
})

// Every .js/.jsx file under src/.
function sources(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? sources(path) : /\.jsx?$/.test(name) ? [path] : []
  })
}

test('native plugins load only behind the isNative() gate', () => {
  const src = new URL('../src/', import.meta.url).pathname
  const staticImports = sources(src).filter((f) => /^import [^;]*from '@capacitor\//m.test(readFileSync(f, 'utf8')))
  // Only native.js imports the plugins, and it is itself imported only lazily.
  assert.deepEqual(staticImports.map((f) => f.slice(src.length)), ['shared/lib/native.js'])
  // native.js is imported statically only by NativeBridge (a lazy chunk);
  // everything else reaches it, and NativeBridge, through import().
  const importers = (re) => sources(src).filter((f) => re.test(readFileSync(f, 'utf8'))).map((f) => f.slice(src.length))
  assert.deepEqual(importers(/^import [^;]*from '[./]*(shared\/lib\/)?native\.js'/m), ['app/NativeBridge.jsx'])
  assert.deepEqual(importers(/^import [^;]*from '[./]*(app\/)?NativeBridge\.jsx'/m), [])
  const main = readFileSync(join(src, 'main.jsx'), 'utf8')
  assert.match(main, /native \? lazy\(\(\) => import\('\.\/app\/NativeBridge\.jsx'\)\) : null/)
  assert.match(main, /\{!native && <AutoUpdate \/>\}/)
})
