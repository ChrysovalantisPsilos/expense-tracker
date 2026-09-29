import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { isSignedInRoute, SIGNED_IN_ROUTES } from '../src/app/routes.js'

// The <Route>s inside the AppShell layout route in App.jsx, as absolute paths.
function shellRoutesInApp() {
  const src = readFileSync(new URL('../src/app/App.jsx', import.meta.url), 'utf8')
  const start = src.search(/<Route element=\{<AppShell\b[^>]*\/>\}>/)
  assert.ok(start > 0, 'AppShell layout route not found in App.jsx')
  // The shell's pages are all leaf routes, so its block ends at the first
  // closing tag. (Nesting routes there would break this parse, loudly.)
  const block = src.slice(start, src.indexOf('</Route>', start))
  const paths = [...block.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => `/${m[1]}`)
  if (/<Route\s+index\b/.test(block)) paths.push('/')
  return paths.filter((p) => p !== '/*')
}

test('SIGNED_IN_ROUTES matches the AppShell routes in App.jsx exactly', () => {
  const inApp = shellRoutesInApp()
  assert.ok(inApp.length > 20, `parsed only ${inApp.length} routes`)
  assert.deepEqual([...inApp].sort(), [...SIGNED_IN_ROUTES].sort())
})

test('real signed-in pages match, including the legacy redirects', () => {
  for (const p of [
    '/', '/transactions', '/transactions/123', '/transactions/new', '/groups/abc', '/groups',
    '/settings/security', '/budgets', '/categories/c1', '/import', '/more', '/insights', '/savings',
    '/recurring', '/plan', '/settings', '/settings/data', '/profile', '/expenses', '/income', '/search',
    // The form pages (no dialogs): a signed-out deep link signs in and comes back.
    '/groups/new', '/groups/abc/settle', '/groups/abc/edit', '/groups/abc/members',
    '/groups/abc/expenses/new', '/groups/abc/expenses/e1', '/groups/abc/comments/e1',
    '/recurring/r1', '/savings/goals/new', '/savings/goals/g1',
    // Goals' old addresses, which redirect to their Savings pages, and the old
    // new-recurring-entry page, which redirects to Add with Repeat on.
    '/insights/goals/new', '/insights/goals/g1', '/recurring/new',
    '/insights/accounts/new', '/insights/accounts/a1', '/settings/categories/new',
    '/settings/data/export', '/settings/data/restore', '/settings/privacy/request',
  ]) {
    assert.equal(isSignedInRoute(p), true, p)
  }
})

test('matching follows the router: trailing slash and letter case are ignored', () => {
  assert.equal(isSignedInRoute('/transactions/'), true)
  assert.equal(isSignedInRoute('/Transactions'), true)
  assert.equal(isSignedInRoute('/SETTINGS/Security'), true)
})

test('unknown addresses do not match', () => {
  for (const p of [
    '/nope', '/does-not-exist', '/transactions/1/edit', '/groupsx', '/groups/abc/def',
    '/groups/abc/settle/x', '/groups/abc/expenses', '/groups/abc/comments', '/recurring/r1/edit',
    '/insights/goals', '/savings/goals', '/savings/x', '/settings/data/other',
    '/settings/unknown', '/categories', '/transactionsx', '/login', '/join', '/kit',
    '', 'transactions', '//transactions', '/transactions//1', null, undefined,
  ]) {
    assert.equal(isSignedInRoute(p), false, String(p))
  }
})
