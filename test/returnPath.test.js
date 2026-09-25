import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  loginPathFor, rememberReturnPath, RETURN_TTL_MS, safeReturnPath, takeReturnPath,
} from '../src/shared/lib/returnPath.js'
import { STORAGE_KEYS } from '../src/shared/lib/keys.js'

test('safeReturnPath: keeps app-relative paths with their query and hash', () => {
  assert.equal(safeReturnPath('/transactions'), '/transactions')
  assert.equal(safeReturnPath('/transactions/123'), '/transactions/123')
  assert.equal(safeReturnPath('/groups/abc?tab=balances#settle'), '/groups/abc?tab=balances#settle')
  assert.equal(safeReturnPath('/settings/security'), '/settings/security')
  assert.equal(safeReturnPath('/'), '/')
  assert.equal(safeReturnPath('/transactions?type=expense&q=caf%C3%A9'), '/transactions?type=expense&q=caf%C3%A9')
})

test('safeReturnPath: rejects absolute and protocol-relative URLs', () => {
  for (const bad of [
    '//evil.com', '//evil.com/transactions', '///evil.com', 'https://evil.com', 'http://evil.com/x',
    'HTTPS://evil.com', 'javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<b>x</b>',
    'vbscript:x', 'mailto:a@b.c', 'evil.com', 'transactions', '?next=/x', '#/x', '.', '../x',
  ]) {
    assert.equal(safeReturnPath(bad), null, bad)
  }
})

test('safeReturnPath: rejects backslashes, whitespace and control characters', () => {
  for (const bad of [
    '/\\evil.com', '\\\\evil.com', '/\\/evil.com', '/transactions\\..\\', '/\t/evil.com',
    '/\n/evil.com', '/\r//evil.com', ' /x', '/x y', '/\u0000x', '/\u007fx', '/ /evil.com',
    '/ x',
  ]) {
    assert.equal(safeReturnPath(bad), null, JSON.stringify(bad))
  }
})

test('safeReturnPath: dot segments cannot fold into another origin', () => {
  assert.equal(safeReturnPath('/..//evil.com'), null)
  assert.equal(safeReturnPath('/.//evil.com'), null)
  assert.equal(safeReturnPath('/a/../..//evil.com'), null)
  assert.equal(safeReturnPath('/a/../groups'), '/groups')
})

test('safeReturnPath: encoded slashes stay inside the path', () => {
  // The router sees these as literal path text, never as a host.
  assert.equal(safeReturnPath('/%2F%2Fevil.com'), '/%2F%2Fevil.com')
  assert.equal(safeReturnPath('/%5Cevil.com'), '/%5Cevil.com')
})

test('safeReturnPath: rejects non-strings, empty and oversized input', () => {
  for (const bad of [undefined, null, 42, {}, ['/x'], '', `/${'a'.repeat(2048)}`]) {
    assert.equal(safeReturnPath(bad), null)
  }
})

test('safeReturnPath: never returns to a sign-in page (no loops)', () => {
  for (const bad of ['/login', '/login?next=/x', '/LOGIN', '/login/', '/verify-email', '/auth/confirm', '/auth/confirm?token_hash=x', '/forgot-password', '/reset-password']) {
    assert.equal(safeReturnPath(bad), null, bad)
  }
  assert.equal(safeReturnPath('/loginx'), '/loginx')
})

test('loginPathFor: encodes the whole location as `next`', () => {
  assert.equal(loginPathFor({ pathname: '/transactions' }), '/login?next=%2Ftransactions')
  assert.equal(
    loginPathFor({ pathname: '/groups/abc', search: '?tab=1', hash: '#x' }),
    '/login?next=%2Fgroups%2Fabc%3Ftab%3D1%23x',
  )
  const next = new URLSearchParams(loginPathFor({ pathname: '/groups/abc', search: '?a=1&b=2' }).split('?')[1]).get('next')
  assert.equal(safeReturnPath(next), '/groups/abc?a=1&b=2')
  assert.equal(loginPathFor({ pathname: '//evil.com' }), '/login')
})

function memoryStorage() {
  const map = new Map()
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)) },
    removeItem: (k) => { map.delete(k) },
  }
}

test('return stash: remembered path is taken once', () => {
  const s = memoryStorage()
  rememberReturnPath('/budgets', s, 1000)
  assert.equal(takeReturnPath(s, 2000), '/budgets')
  assert.equal(takeReturnPath(s, 2000), null)
  assert.equal(s.map.size, 0)
})

test('return stash: an unsafe or empty path clears it', () => {
  const s = memoryStorage()
  rememberReturnPath('/budgets', s, 1000)
  rememberReturnPath('//evil.com', s, 1000)
  assert.equal(takeReturnPath(s, 1000), null)
  rememberReturnPath('/budgets', s, 1000)
  rememberReturnPath(null, s, 1000)
  assert.equal(s.map.size, 0)
})

test('return stash: expires, and ignores clocks running backwards', () => {
  const s = memoryStorage()
  rememberReturnPath('/budgets', s, 0)
  assert.equal(takeReturnPath(s, RETURN_TTL_MS + 1), null)
  rememberReturnPath('/budgets', s, 5000)
  assert.equal(takeReturnPath(s, 4000), null)
  rememberReturnPath('/budgets', s, 0)
  assert.equal(takeReturnPath(s, RETURN_TTL_MS), '/budgets')
})

test('return stash: tampered storage is re-validated and cleared', () => {
  const s = memoryStorage()
  const key = STORAGE_KEYS.returnPath
  s.setItem(key, JSON.stringify({ path: '//evil.com', at: 0 }))
  assert.equal(takeReturnPath(s, 0), null)
  assert.equal(s.map.size, 0)
  s.setItem(key, 'not json')
  assert.equal(takeReturnPath(s, 0), null)
  s.setItem(key, JSON.stringify({ path: '/x' }))
  assert.equal(takeReturnPath(s, 0), null)
})

test('return stash: a throwing storage is survived', () => {
  const broken = { getItem() { throw new Error('denied') }, setItem() { throw new Error('denied') }, removeItem() { throw new Error('denied') } }
  assert.doesNotThrow(() => rememberReturnPath('/budgets', broken, 0))
  assert.equal(takeReturnPath(broken, 0), null)
})
