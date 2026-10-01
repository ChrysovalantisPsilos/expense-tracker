import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  confirmDestination, confirmLinkTemplate, CONFIRM_PATH, expiredLinkHelp, parseConfirmLink,
} from '../src/features/auth/confirmLink.js'
import { safeReturnPath } from '../src/shared/lib/returnPath.js'

const HASH = 'pkce_0123456789abcdef0123456789abcdef0123456789abcdef'

test('parseConfirmLink: reads the token hash and type of each email', () => {
  for (const type of ['signup', 'email', 'magiclink', 'recovery', 'email_change']) {
    assert.deepEqual(parseConfirmLink(`?token_hash=${HASH}&type=${type}`), { tokenHash: HASH, type })
  }
  // Order and extra parameters don't matter.
  assert.deepEqual(parseConfirmLink(`?type=recovery&utm=x&token_hash=${HASH}`), { tokenHash: HASH, type: 'recovery' })
})

test('parseConfirmLink: anything incomplete or odd is no link', () => {
  for (const bad of [
    '', '?', `?token_hash=${HASH}`, '?type=signup', `?token_hash=${HASH}&type=invite`,
    `?token_hash=${HASH}&type=SIGNUP`, `?token_hash=${HASH}&type=`, '?token_hash=short&type=signup',
    `?token_hash=${HASH}%3Cscript%3E&type=signup`, `?token_hash=${'a'.repeat(513)}&type=signup`,
    `?token_hash=${HASH}.x&type=signup`,
    // Supabase's own variables left unfilled (a preview, a broken template).
    '?token_hash={{ .TokenHash }}&type=signup',
  ]) {
    assert.equal(parseConfirmLink(bad), null, bad)
  }
  assert.equal(parseConfirmLink(undefined), null)
})

test('parseConfirmLink: reads a query as URLSearchParams does (the app has none to lean on)', () => {
  const viaParams = (q) => {
    const p = new URLSearchParams(q)
    return { tokenHash: p.get('token_hash'), type: p.get('type') }
  }
  for (const q of [
    `?token_hash=${HASH}&type=signup`, `token_hash=${HASH}&type=recovery`, `?token%5Fhash=${HASH}&type=email`,
    `?token_hash=${HASH}&type=re%63overy`, `?type=signup&type=recovery&token_hash=${HASH}`,
    `?token_hash=${HASH}+&type=signup`, `?token_hash=${HASH}%zz&type=signup`, `?&&token_hash=${HASH}&type&type=email`,
  ]) {
    const want = viaParams(q)
    const valid = want.tokenHash && /^[A-Za-z0-9_-]{8,512}$/.test(want.tokenHash) &&
      ['signup', 'email', 'magiclink', 'recovery', 'email_change'].includes(want.type)
    assert.deepEqual(parseConfirmLink(q), valid ? want : null, q)
  }
})

test('confirmDestination: a reset goes to the new-password screen; the rest sign in', () => {
  assert.equal(confirmDestination('recovery'), '/reset-password')
  for (const type of ['signup', 'email', 'magiclink', 'email_change']) assert.equal(confirmDestination(type), null)
})

test('expiredLinkHelp: a fresh reset link for a reset; log in or sign up again otherwise', () => {
  assert.deepEqual(expiredLinkHelp('recovery').actions, [{ label: 'Request a new link', to: '/forgot-password' }])
  for (const type of ['signup', 'magiclink', undefined]) {
    const { text, actions } = expiredLinkHelp(type)
    assert.match(text, /isn’t valid anymore/)
    assert.deepEqual(actions.map((a) => a.to), ['/login', '/login?signup=1'])
  }
})

test('confirmLinkTemplate: our own site with Supabase’s token hash', () => {
  assert.equal(confirmLinkTemplate('signup'), '{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup')
  assert.throws(() => confirmLinkTemplate('invite'))
  // A filled-in link parses back to what was sent.
  const url = confirmLinkTemplate('recovery').replace('{{ .SiteURL }}', 'https://budgeer.com').replace('{{ .TokenHash }}', HASH)
  const { pathname, search } = new URL(url)
  assert.equal(pathname, CONFIRM_PATH)
  assert.deepEqual(parseConfirmLink(search), { tokenHash: HASH, type: 'recovery' })
})

test('the confirm page is a public route, signed-out only, and never a return path', () => {
  const app = readFileSync(new URL('../src/app/App.jsx', import.meta.url), 'utf8')
  assert.ok(app.includes(`<Route path="${CONFIRM_PATH}" element={<ConfirmLink />} />`))
  // Signed in, it hands over to the app (the pending invite / return path).
  assert.match(app, new RegExp(`\\[[^\\]]*'${CONFIRM_PATH}'[^\\]]*\\]\\.map\\(\\(path\\) => \\(\\s*<Route key=\\{path\\} path=\\{path\\} element=\\{<Navigate to="/" replace />\\}`))
  assert.equal(safeReturnPath(`${CONFIRM_PATH}?token_hash=${HASH}&type=signup`), null)
})

test('the service worker always fetches /auth/confirm fresh from the network', () => {
  const sw = readFileSync(new URL('../src/sw.js', import.meta.url), 'utf8')
  const denylist = sw.match(/denylist: \[([^\n]*)\],\n/)[1]
  assert.ok(denylist.includes(String.raw`/^\/auth\/confirm(?:[/?]|$)/`), denylist)
  const re = /^\/auth\/confirm(?:[/?]|$)/
  assert.ok(re.test(`${CONFIRM_PATH}?token_hash=${HASH}&type=signup`))
  assert.ok(re.test(CONFIRM_PATH))
  assert.ok(!re.test('/auth/confirmed') && !re.test('/transactions'))
})
