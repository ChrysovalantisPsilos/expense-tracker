// The apple-app-site-association file the website serves (public/.well-known/):
// which https links open the iOS apps (Universal Links) and which apps may use
// the site's passkeys (webcredentials). Kept in step with the apps' bundle ids
// (ios/Budgeer/Config/*.xcconfig), their Associated Domains entitlements and
// the pages the app can open (AppPaths.swift).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const aasa = JSON.parse(read('public/.well-known/apple-app-site-association'))
const xcconfig = (name) => Object.fromEntries(read(`ios/Budgeer/Config/${name}.xcconfig`).split('\n')
  .map((line) => line.match(/^([A-Z_]+)\s*=\s*(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]))
const dev = xcconfig('Dev')
const prod = xcconfig('Prod')

// Apple's matching of a link against the components: the first component
// whose path pattern (* any run of characters, ? one) and query patterns all
// match decides, and an `exclude` one means the website keeps the link.
const glob = (pattern) => new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`)
function opensInApp(link) {
  const url = new URL(link, 'https://www.budgeer.com')
  for (const c of aasa.applinks.details[0].components) {
    if (!glob(c['/']).test(url.pathname)) continue
    const query = Object.entries(c['?'] ?? {})
    if (!query.every(([key, pattern]) => url.searchParams.has(key) && glob(pattern).test(url.searchParams.get(key)))) continue
    return !c.exclude
  }
  return false
}

test('AASA: both apps, with the team in front of each bundle id', () => {
  const ids = [prod.BUDGEER_BUNDLE_ID, dev.BUDGEER_BUNDLE_ID]
  assert.deepEqual(ids, ['com.budgeer.app', 'com.budgeer.app.dev'])
  const { details } = aasa.applinks
  assert.equal(details.length, 1)
  const team = details[0].appIDs[0].split('.')[0]
  assert.match(team, /^[A-Z0-9]{10}$/)
  assert.deepEqual(details[0].appIDs, ids.map((id) => `${team}.${id}`))
  // Passkeys: the same apps may use the site's (the relying party's) credentials.
  assert.deepEqual(aasa.webcredentials.apps, details[0].appIDs)
  assert.deepEqual(Object.keys(aasa).sort(), ['applinks', 'webcredentials'])
})

test('AASA: the links the app opens', () => {
  for (const link of [
    '/join/a1b2c3d4e5f6', '/join/a1b2c3d4e5f6/', '/auth/confirm?token_hash=pkce_0123456789abcdef&type=signup',
    '/auth/confirm?type=recovery&token_hash=abcdef0123456789', '/', '/budgets', '/transactions?type=expense',
    '/import', '/groups', '/groups/new', '/groups/9f1c0e2a', '/groups/9f1c0e2a/', '/more', '/recurring', '/plan', '/insights',
    '/insights/salary', '/savings', '/vouchers', '/categories/c1?period=m%3A2026-9', '/categories/none', '/help',
    '/settings', '/settings/security', '/settings/ai', '/settings/whats-new', '/settings/privacy/request',
    '/settings/data/export', '/settings/data/restore',
  ]) {
    assert.equal(opensInApp(link), true, link)
  }
})

test('AASA: the pages the app can’t show stay on the website', () => {
  for (const link of [
    '/join/abc123/more', '/groups/g1/edit', '/groups/g1/members', '/groups/g1/settle', '/groups/g1/expenses/new',
    '/groups/g1/comments/c1', '/categories/c1/x', '/auth/confirm', '/auth/confirm?token_hash=abc', '/login',
    '/verify-email', '/forgot-password', '/reset-password', '/privacy', '/terms', '/kit', '/transactions/t1',
    '/transactions/new', '/recurring/r1', '/savings/goals/new', '/insights/accounts/a1', '/settings/categories/new',
    '/settings/unknown', '/assets/index.js', '/og-image.png', '/apple-app-site-association', '/Budgets',
  ]) {
    assert.equal(opensInApp(link), false, link)
  }
})

test('AASA: every page it claims is one the app knows (AppPaths.swift)', () => {
  const paths = read('ios/Budgeer/Budgeer/App/AppPaths.swift')
  for (const { '/': path, exclude } of aasa.applinks.details[0].components) {
    if (exclude || path === '/' || /^\/(join|auth)\//.test(path)) continue
    const parts = path.split('/').filter(Boolean)
    if (parts.length === 1) {
      assert.ok(parts[0] === 'help' ? paths.includes('parts.first == "help"') : paths.includes(`"${parts[0]}": Place(`), path)
    } else if (parts[0] === 'settings' && parts.length === 2) {
      assert.ok(paths.includes(`"${parts[1]}": .`), path)
    } else {
      assert.ok(paths.includes(`case "${parts[0]}"`) || paths.includes(`parts == [${parts.map((p) => `"${p}"`).join(', ')}]`) ||
        paths.includes(`"${parts[0]}" where parts[1] == "${parts[1]}"`), path)
    }
  }
})

test('the website serves it as JSON, at /.well-known and the root, never as the app page', () => {
  const vercel = JSON.parse(read('vercel.json'))
  for (const source of ['/.well-known/apple-app-site-association', '/apple-app-site-association']) {
    const rule = vercel.headers.find((h) => h.source === source)
    assert.ok(rule, source)
    assert.deepEqual(rule.headers.find((h) => h.key === 'Content-Type'), { key: 'Content-Type', value: 'application/json' })
  }
  // The root address reaches the same file, ahead of the single-page app's catch-all.
  assert.deepEqual(vercel.rewrites[0], {
    source: '/apple-app-site-association', destination: '/.well-known/apple-app-site-association',
  })
  // The catch-all leaves /.well-known/… alone (it has a dot), so the file itself is served.
  const spa = new RegExp(`^${vercel.rewrites.find((r) => r.destination === '/index.html').source}$`)
  assert.equal(spa.test('/.well-known/apple-app-site-association'), false)
})

test('each app claims only its own site, for links and for passkeys', () => {
  assert.equal(dev.BUDGEER_WEB_HOST, 'dev.budgeer.com')
  assert.equal(dev.BUDGEER_WEB_APEX, 'dev.budgeer.com')
  assert.equal(prod.BUDGEER_WEB_HOST, 'www.budgeer.com')
  assert.equal(prod.BUDGEER_WEB_APEX, 'budgeer.com')
  for (const name of ['Debug', 'Release']) {
    const plist = read(`ios/Budgeer/Config/Budgeer-${name}.entitlements`)
    const domains = plist.match(/<key>com\.apple\.developer\.associated-domains<\/key>\s*<array>([\s\S]*?)<\/array>/)
    assert.ok(domains, name)
    assert.deepEqual([...domains[1].matchAll(/<string>([^<]*)<\/string>/g)].map((m) => m[1]), [
      'applinks:$(BUDGEER_WEB_HOST)', 'applinks:$(BUDGEER_WEB_APEX)', 'webcredentials:$(BUDGEER_WEB_HOST)',
    ])
  }
})

test('budgeer.com sends everything to www except the file Apple fetches (it follows no redirect)', () => {
  const vercel = JSON.parse(read('vercel.json'))
  const apex = vercel.redirects.filter((r) => r.has?.some((h) => h.type === 'host' && h.value === 'budgeer.com'))
  assert.equal(apex.length, 1)
  const [rule] = apex
  assert.equal(rule.destination, 'https://www.budgeer.com/$1')
  assert.equal(rule.permanent, true)
  const source = new RegExp(`^${rule.source}$`)
  for (const path of ['/', '/join/abc123', '/auth/confirm', '/budgets', '/assets/index.js']) assert.equal(source.test(path), true, path)
  assert.equal(source.test('/.well-known/apple-app-site-association'), false)
})
