// The iOS app's links (src/shared/lib/deepLinks.js): what each URL that opens
// the app does, the hostile ones dropped, and the universal-link paths kept in
// step with public/.well-known/apple-app-site-association.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { APP_LINKS, APP_SCHEME, deepLinkTarget, nativeAuthRedirect } from '../src/shared/lib/deepLinks.js'
import { LIVE, TEST } from '../src/shared/lib/environment.js'

const CODE = '3f2c1d7e-8b9a-4c5d-9e0f-1a2b3c4d5e6f'

test('Google sign-in returns on the app scheme, with a safe next path only', () => {
  assert.equal(APP_SCHEME, 'com.budgeer.app')
  assert.equal(nativeAuthRedirect(), 'com.budgeer.app://auth/callback')
  assert.equal(nativeAuthRedirect(null), 'com.budgeer.app://auth/callback')
  assert.equal(
    nativeAuthRedirect('/settings/security?linked=google'),
    'com.budgeer.app://auth/callback?next=%2Fsettings%2Fsecurity%3Flinked%3Dgoogle',
  )
  for (const bad of ['https://evil.example', '//evil.example', '/login', '/\\evil.example']) {
    assert.equal(nativeAuthRedirect(bad), 'com.budgeer.app://auth/callback', bad)
  }
})

test('the sign-in callback: code, next, and errors', () => {
  assert.deepEqual(deepLinkTarget(`com.budgeer.app://auth/callback?code=${CODE}`), { kind: 'signin', code: CODE, path: null })
  // The round trip of nativeAuthRedirect(next), with the code Supabase appends.
  const back = `${nativeAuthRedirect('/settings/security?linked=google')}&code=${CODE}`
  assert.deepEqual(deepLinkTarget(back), { kind: 'signin', code: CODE, path: '/settings/security?linked=google' })
  // An error goes back to the page that asked, with the error for it to show.
  const denied = `${nativeAuthRedirect('/settings/security?linked=google')}&error=access_denied&error_description=User+said+no`
  assert.deepEqual(deepLinkTarget(denied), {
    kind: 'signin', code: null,
    path: '/settings/security?linked=google&error=access_denied&error_description=User+said+no',
  })
  assert.deepEqual(deepLinkTarget('com.budgeer.app://auth/callback?error=server_error'), { kind: 'signin', code: null, path: null })
})

test('a hostile or broken callback is ignored', () => {
  for (const url of [
    'com.budgeer.app://auth/callback', // no code
    'com.budgeer.app://auth/callback?code=', // empty
    'com.budgeer.app://auth/callback?code=abc', // too short
    `com.budgeer.app://auth/callback?code=${CODE}%3Cscript%3E`, // not a code
    `com.budgeer.app://auth/callbackx?code=${CODE}`,
    `com.budgeer.app://user:pw@auth/callback?code=${CODE}`,
    `evil.app://auth/callback?code=${CODE}`,
    `https://dev.budgeer.com/auth/callback?code=${CODE}`, // only the scheme carries codes
  ]) {
    assert.equal(deepLinkTarget(url, TEST), null, url)
  }
  // An unsafe next is dropped; the sign-in itself still finishes.
  for (const next of ['https%3A%2F%2Fevil.example', '%2F%2Fevil.example', '%2F%5Cevil.example', 'javascript%3Aalert(1)']) {
    assert.deepEqual(
      deepLinkTarget(`com.budgeer.app://auth/callback?next=${next}&code=${CODE}`),
      { kind: 'signin', code: CODE, path: null }, next,
    )
  }
})

test('invite links open the invite, on the scheme and on this build\'s site', () => {
  assert.deepEqual(deepLinkTarget('com.budgeer.app://join/9f86d081884c7d65', TEST), { kind: 'route', path: '/join/9f86d081884c7d65' })
  assert.deepEqual(deepLinkTarget('https://dev.budgeer.com/join/9f86d081884c7d65', TEST), { kind: 'route', path: '/join/9f86d081884c7d65' })
  assert.deepEqual(deepLinkTarget('https://www.budgeer.com/join/abc_DEF-123/', LIVE), { kind: 'route', path: '/join/abc_DEF-123' })
  assert.deepEqual(deepLinkTarget('https://BUDGEER.com/join/abc?utm=x#frag', LIVE), { kind: 'route', path: '/join/abc' })
})

test('email confirm and reset links open the app, keeping only the token', () => {
  const link = 'https://dev.budgeer.com/auth/confirm?token_hash=pkce_0a1b2c3d4e5f&type=recovery&redirect_to=https://evil.example'
  assert.deepEqual(deepLinkTarget(link, TEST), { kind: 'route', path: '/auth/confirm?token_hash=pkce_0a1b2c3d4e5f&type=recovery' })
  assert.deepEqual(deepLinkTarget('https://dev.budgeer.com/auth/confirm', TEST), { kind: 'route', path: '/auth/confirm' })
})

test('the other site\'s links go to the browser', () => {
  assert.deepEqual(
    deepLinkTarget('https://www.budgeer.com/join/abc', TEST),
    { kind: 'browser', url: 'https://www.budgeer.com/join/abc' },
  )
  assert.deepEqual(
    deepLinkTarget('https://dev.budgeer.com/auth/confirm?token_hash=abcdefgh&type=signup', LIVE),
    { kind: 'browser', url: 'https://dev.budgeer.com/auth/confirm?token_hash=abcdefgh&type=signup' },
  )
})

test('unknown or hostile URLs are rejected', () => {
  for (const url of [
    undefined, null, 42, '', 'not a url', '/join/abc',
    'https://evil.example/join/abc',
    'https://dev.budgeer.com.evil.example/join/abc',
    'https://evil.example@dev.budgeer.com/join/abc',
    'https://dev.budgeer.com:8443/join/abc',
    'http://dev.budgeer.com/join/abc',
    'javascript:alert(1)//dev.budgeer.com/join/abc',
    'data:text/html,<script>alert(1)</script>',
    'https://dev.budgeer.com/',
    'https://dev.budgeer.com/settings',
    'https://dev.budgeer.com/join/',
    'https://dev.budgeer.com/join/a/b',
    'https://dev.budgeer.com/join/%2F%2Fevil.example',
    'https://dev.budgeer.com/join/..%2F..%2Fsettings',
    'https://dev.budgeer.com/join/../settings',
    'https://dev.budgeer.com/join/<script>',
    `https://dev.budgeer.com/join/${'a'.repeat(129)}`,
    'com.budgeer.app://settings/data',
    'com.budgeer.app://evil.example/join/abc',
    `https://dev.budgeer.com/join/abc?${'x'.repeat(5000)}`,
  ]) {
    assert.equal(deepLinkTarget(url, TEST), null, String(url))
  }
})

test('the app links match apple-app-site-association', () => {
  const aasa = JSON.parse(readFileSync(new URL('../public/.well-known/apple-app-site-association', import.meta.url), 'utf8'))
  const [details] = aasa.applinks.details
  assert.deepEqual(details.components.map((c) => c['/']), Object.keys(APP_LINKS))
  // TEAM_ID until the Apple Team ID is filled in (docs/IOS.md).
  assert.equal(details.appIDs.length, 1)
  assert.match(details.appIDs[0], /^(TEAM_ID|[A-Z0-9]{10})\.com\.budgeer\.app$/)
  const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
  const served = vercel.headers.find((h) => h.source === '/.well-known/apple-app-site-association')
  assert.deepEqual(served.headers, [{ key: 'Content-Type', value: 'application/json' }])
})
