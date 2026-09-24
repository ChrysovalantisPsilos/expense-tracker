import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ERROR_VARIANTS, errorScreen, errorVariant, isChunkLoadError } from '../src/shared/ui/errorScreens.js'

test('isChunkLoadError: recognises every browser’s failed-chunk message', () => {
  const messages = [
    'Failed to fetch dynamically imported module: https://budgeer.com/assets/Budgets-abc123.js', // Chrome
    'Importing a module script failed.', // Safari
    'error loading dynamically imported module: https://budgeer.com/assets/x.js', // Firefox
    'Unable to preload CSS for /assets/Insights-9f8e.css', // Vite
    'Loading chunk 42 failed.', // webpack-style
    'Loading CSS chunk vendors-main failed.',
  ]
  for (const m of messages) {
    assert.equal(isChunkLoadError(new Error(m)), true, m)
    assert.equal(isChunkLoadError(new TypeError(m)), true, m)
  }
  const named = new Error('whatever')
  named.name = 'ChunkLoadError'
  assert.equal(isChunkLoadError(named), true)
  assert.equal(isChunkLoadError('Failed to fetch dynamically imported module'), true)
})

test('isChunkLoadError: ordinary errors are not chunk errors', () => {
  for (const e of [
    new Error('Cannot read properties of undefined (reading "map")'),
    new TypeError('Failed to fetch'), // a data request, not a code chunk
    new Error(''), {}, { message: 42 }, null, undefined,
  ]) {
    assert.equal(isChunkLoadError(e), false, String(e?.message))
  }
})

test('errorVariant: offline wins, then chunk errors mean a new version', () => {
  const chunk = new Error('Failed to fetch dynamically imported module: /assets/a.js')
  const bug = new Error('boom')
  assert.equal(errorVariant(chunk, true), 'update')
  assert.equal(errorVariant(bug, true), 'crash')
  assert.equal(errorVariant(chunk, false), 'offline')
  assert.equal(errorVariant(bug, false), 'offline')
  // No navigator.onLine at all: don't claim offline.
  assert.equal(errorVariant(bug, undefined), 'crash')
  assert.equal(errorVariant(chunk, undefined), 'update')
})

test('errorScreen: the 404 copy and its actions signed out and signed in', () => {
  const out = errorScreen('notFound', { signedIn: false })
  assert.equal(out.title, 'This page rolled away')
  assert.match(out.body, /couldn’t find what you were looking for/)
  assert.deepEqual(out.actions.map((a) => [a.id, a.label]), [['home', 'Go to Home'], ['help', 'Help & FAQ']])
  const inside = errorScreen('notFound', { signedIn: true })
  assert.deepEqual(inside.actions.map((a) => [a.id, a.label]), [['home', 'Back to Home'], ['back', 'Go back']])
  assert.equal(out.showDetail, false)
})

test('errorScreen: crash keeps Reload, the reassurance and the technical detail', () => {
  const s = errorScreen('crash')
  assert.equal(s.actions[0].id, 'reload')
  assert.equal(s.actions[0].label, 'Reload')
  assert.match(s.body, /data is safe on the server/)
  assert.equal(s.showDetail, true)
})

test('errorScreen: new version reloads, offline tries again', () => {
  const up = errorScreen('update')
  assert.match(up.title, /new version of Budgeer is ready/)
  assert.deepEqual(up.actions.map((a) => [a.id, a.label]), [['reload', 'Reload']])
  const off = errorScreen('offline')
  assert.match(off.title, /offline/)
  assert.deepEqual(off.actions.map((a) => [a.id, a.label]), [['reload', 'Try again']])
})

test('errorScreen: every variant has copy and exactly one primary action', () => {
  assert.deepEqual(ERROR_VARIANTS, ['notFound', 'crash', 'update', 'offline'])
  for (const v of ERROR_VARIANTS) {
    for (const signedIn of [false, true]) {
      const s = errorScreen(v, { signedIn })
      assert.ok(s.eyebrow && s.title && s.body, v)
      assert.equal(s.actions.filter((a) => a.primary).length, 1, v)
      assert.equal(s.actions[0].primary, true, `${v}: primary comes first`)
    }
  }
  assert.throws(() => errorScreen('nope'))
})
