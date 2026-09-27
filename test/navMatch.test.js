import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isAccountPage, isNavActive, showsAddExpense } from '../src/app/navMatch.js'

test('Home is active only on the root', () => {
  assert.equal(isNavActive('/', '/'), true)
  assert.equal(isNavActive('/', '/transactions'), false)
  assert.equal(isNavActive('/', '/groups/1'), false)
})

test('Transactions owns /transactions and /import', () => {
  assert.equal(isNavActive('/transactions', '/transactions'), true)
  assert.equal(isNavActive('/transactions', '/import'), true)
  assert.equal(isNavActive('/transactions', '/budgets'), false)
  assert.equal(isNavActive('/transactions', '/importer'), false)
})

test('More owns /more, /insights, /savings, /recurring, /plan, /help, the legal pages and every /settings page', () => {
  for (const p of ['/more', '/insights', '/savings', '/recurring', '/plan', '/settings', '/settings/account', '/settings/data', '/help', '/privacy', '/terms']) {
    assert.equal(isNavActive('/more', p), true, p)
  }
  assert.equal(isNavActive('/more', '/transactions'), false)
  assert.equal(isNavActive('/more', '/'), false)
})

test('Groups owns the group list and every group page', () => {
  assert.equal(isNavActive('/groups', '/groups'), true)
  assert.equal(isNavActive('/groups', '/groups/abc-123'), true)
  assert.equal(isNavActive('/groups', '/groupsx'), false)
  assert.equal(isNavActive('/groups', '/budgets'), false)
})

test('Any other entry matches its own path and the pages below it', () => {
  assert.equal(isNavActive('/budgets', '/budgets'), true)
  assert.equal(isNavActive('/insights', '/insights'), true)
  assert.equal(isNavActive('/recurring', '/insights'), false)
  assert.equal(isNavActive('/savings', '/savings/goals/g1'), true)
  assert.equal(isNavActive('/insights', '/savings'), false)
  assert.equal(isNavActive('/savings', '/savingsx'), false)
  assert.equal(isNavActive('/settings', '/settings/security'), true)
})

test('exactly one bottom-bar tab is active on every routed page', () => {
  const TABS = ['/', '/transactions', '/groups', '/budgets', '/more']
  const PAGES = ['/', '/transactions', '/import', '/groups', '/groups/g1', '/budgets',
    '/more', '/insights', '/savings', '/recurring', '/settings', '/settings/notifications', '/categories/none']
  for (const p of PAGES) {
    assert.equal(TABS.filter((t) => isNavActive(t, p)).length, 1, p)
  }
  assert.equal(isNavActive('/budgets', '/categories/c1'), true) // a category's page, with its budget
})

test('the floating Add expense button shows on the four main tabs only', () => {
  for (const p of ['/', '/transactions', '/transactions/', '/groups', '/budgets']) {
    assert.equal(showsAddExpense(p), true, p)
  }
  for (const p of ['/transactions/new', '/transactions/42', '/groups/1', '/settings', '/settings/account',
    '/more', '/insights', '/savings', '/recurring', '/import', '/categories/1', '/help']) {
    assert.equal(showsAddExpense(p), false, p)
  }
})

test('the floating Add expense button steps aside while the page shows an empty state', () => {
  for (const p of ['/', '/transactions', '/groups', '/budgets']) {
    assert.equal(showsAddExpense(p, { emptyState: true }), false, p)
    assert.equal(showsAddExpense(p, { emptyState: false }), true, p)
  }
  assert.equal(showsAddExpense('/recurring', { emptyState: false }), false)
})

test('the form pages never show the floating Add expense button, and light their section', () => {
  const FORMS = {
    '/groups': ['/groups/new', '/groups/g1/settle', '/groups/g1/edit', '/groups/g1/members',
      '/groups/g1/expenses/new', '/groups/g1/expenses/e1', '/groups/g1/comments/e1'],
    '/more': ['/recurring/new', '/recurring/r1', '/savings/goals/new', '/savings/goals/g1',
      '/insights/accounts/new', '/insights/accounts/a1', '/settings/categories/new',
      '/settings/data/export', '/settings/data/restore', '/settings/privacy/request'],
  }
  for (const [tab, pages] of Object.entries(FORMS)) {
    for (const p of pages) {
      assert.equal(showsAddExpense(p), false, p)
      assert.equal(isNavActive(tab, p), true, p)
    }
  }
})

test('sideways, the avatar owns Settings: More stays dark there, and nothing else changes', () => {
  const apart = { accountApart: true }
  for (const p of ['/settings', '/settings/account', '/settings/appearance', '/settings/data/export']) {
    assert.equal(isAccountPage(p), true, p)
    assert.equal(isNavActive('/more', p, apart), false, p)
    assert.equal(isNavActive('/more', p), true, `${p} (portrait and desktop still light More)`)
    for (const to of ['/', '/transactions', '/groups', '/budgets']) assert.equal(isNavActive(to, p, apart), false, `${to} on ${p}`)
  }
  // More keeps the rest of its section.
  for (const p of ['/more', '/insights', '/savings', '/recurring', '/help', '/privacy', '/terms']) {
    assert.equal(isAccountPage(p), false, p)
    assert.equal(isNavActive('/more', p, apart), true, p)
  }
  assert.equal(isAccountPage('/settingsx'), false)
  assert.equal(isNavActive('/transactions', '/import', apart), true)
})
