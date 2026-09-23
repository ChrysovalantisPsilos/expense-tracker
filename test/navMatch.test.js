import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isNavActive } from '../src/app/navMatch.js'

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

test('More owns /more, /insights, /recurring, /help and every /settings page', () => {
  for (const p of ['/more', '/insights', '/recurring', '/settings', '/settings/account', '/settings/data', '/help']) {
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
  assert.equal(isNavActive('/settings', '/settings/security'), true)
})

test('exactly one bottom-bar tab is active on every routed page', () => {
  const TABS = ['/', '/transactions', '/groups', '/budgets', '/more']
  const PAGES = ['/', '/transactions', '/import', '/groups', '/groups/g1', '/budgets',
    '/more', '/insights', '/recurring', '/settings', '/settings/notifications', '/categories/none']
  for (const p of PAGES) {
    assert.equal(TABS.filter((t) => isNavActive(t, p)).length, 1, p)
  }
  assert.equal(isNavActive('/budgets', '/categories/c1'), true) // a category's page, with its budget
})
