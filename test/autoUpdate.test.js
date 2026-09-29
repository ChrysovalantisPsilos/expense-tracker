import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isSafeToReload, unsavedFormAttr, UNSAVED_FORM_ATTR,
  missedUpdate, chunkReloadDue, reloadForNewVersion, CHUNK_RELOAD_WINDOW_MS,
} from '../src/shared/lib/autoUpdate.js'
import { STORAGE_KEYS } from '../src/shared/lib/keys.js'

// A document stub. querySelectorAll finds whichever parts of the selector
// list are "on the page": an open dialog, a closed popover's hidden dialog
// panel, and/or a form with unsaved input. `legacy` elements have no
// checkVisibility, so the computed-style fallback decides.
const el = (visible, legacy = false) => (legacy
  ? { style: { display: 'block', visibility: visible ? 'visible' : 'hidden' } }
  : { checkVisibility: () => visible })
const doc = ({ hidden = false, active = null, dialog = false, closedPopover = false, unsaved = false, legacy = false } = {}) => ({
  visibilityState: hidden ? 'hidden' : 'visible',
  activeElement: active,
  defaultView: { getComputedStyle: (e) => e.style },
  querySelectorAll: (sel) => {
    const parts = sel.split(',').map((s) => s.trim())
    const found = []
    if (parts.some((s) => s.includes('role="dialog"'))) {
      if (dialog) found.push(el(true, legacy))
      if (closedPopover) found.push(el(false, legacy))
    }
    if (unsaved && parts.includes(`[${UNSAVED_FORM_ATTR}]`)) found.push(el(true, legacy))
    return found
  },
})

test('isSafeToReload: idle visible page is safe', () => {
  assert.equal(isSafeToReload(doc({ active: { tagName: 'BODY' } })), true)
})

test('isSafeToReload: typing in a field or an open dialog is not safe', () => {
  assert.equal(isSafeToReload(doc({ active: { tagName: 'INPUT' } })), false)
  assert.equal(isSafeToReload(doc({ active: { tagName: 'TEXTAREA' } })), false)
  assert.equal(isSafeToReload(doc({ active: { tagName: 'DIV', isContentEditable: true } })), false)
  assert.equal(isSafeToReload(doc({ dialog: true })), false)
  assert.equal(isSafeToReload(doc({ dialog: true, legacy: true })), false)
})

test('isSafeToReload: a closed popover\'s hidden dialog panel does not block', () => {
  assert.equal(isSafeToReload(doc({ closedPopover: true })), true)
  assert.equal(isSafeToReload(doc({ closedPopover: true, legacy: true })), true)
  assert.equal(isSafeToReload(doc({ closedPopover: true, dialog: true })), false)
})

test('isSafeToReload: a form page with unsaved input is not safe, even with focus elsewhere', () => {
  assert.equal(isSafeToReload(doc({ unsaved: true, active: { tagName: 'BODY' } })), false)
  assert.equal(isSafeToReload(doc({ unsaved: true, active: { tagName: 'BUTTON' } })), false)
  assert.equal(isSafeToReload(doc({ unsaved: true, legacy: true })), false)
})

test('isSafeToReload: a hidden tab is always safe', () => {
  assert.equal(isSafeToReload(doc({ hidden: true, active: { tagName: 'INPUT' }, dialog: true })), true)
  assert.equal(isSafeToReload(doc({ hidden: true, unsaved: true })), true)
})

test('unsavedFormAttr: the marker only while dirty', () => {
  assert.equal(UNSAVED_FORM_ATTR, 'data-unsaved-form')
  assert.deepEqual(unsavedFormAttr(true), { 'data-unsaved-form': '' })
  assert.deepEqual(unsavedFormAttr(false), {})
})

test('missedUpdate: only a replacing worker, activated, on an uncontrolled page', () => {
  // The Groups report: a tab opened before the first worker installed, then
  // a deploy. The new worker activates straight away and nothing reloads.
  assert.equal(missedUpdate({ state: 'activated', replacedActive: true, controlled: false }), true)
  // The first worker ever: nothing newer to move to.
  assert.equal(missedUpdate({ state: 'activated', replacedActive: false, controlled: false }), false)
  // A controlled page goes through "waiting" and the usual reload.
  assert.equal(missedUpdate({ state: 'activated', replacedActive: true, controlled: true }), false)
  for (const state of ['installing', 'installed', 'activating', 'redundant']) {
    assert.equal(missedUpdate({ state, replacedActive: true, controlled: false }), false, state)
  }
})

test('chunkReloadDue: once per window, and an unreadable record counts as none', () => {
  const now = 1_790_000_000_000
  const rec = (at) => JSON.stringify({ at, message: 'x' })
  assert.equal(chunkReloadDue(null, now), true)
  assert.equal(chunkReloadDue('not json', now), true)
  assert.equal(chunkReloadDue(JSON.stringify({}), now), true)
  assert.equal(chunkReloadDue(rec(now - 1000), now), false)
  assert.equal(chunkReloadDue(rec(now - CHUNK_RELOAD_WINDOW_MS + 1), now), false)
  assert.equal(chunkReloadDue(rec(now - CHUNK_RELOAD_WINDOW_MS), now), true)
  // A clock that went backwards doesn't block for ever.
  assert.equal(chunkReloadDue(rec(now + 60_000), now), true)
})

test('reloadForNewVersion: reloads once, keeps the error, never loops', () => {
  const store = new Map()
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) }
  let reloads = 0
  const reload = () => { reloads += 1 }
  const error = new TypeError('Importing a module script failed.')
  const now = 1_790_000_000_000
  assert.equal(reloadForNewVersion(error, { storage, reload, now }), true)
  assert.equal(reloads, 1)
  assert.deepEqual(JSON.parse(store.get(STORAGE_KEYS.chunkReload)), { at: now, message: 'Importing a module script failed.' })
  // The chunk fails again right after the reload: the screen shows instead.
  assert.equal(reloadForNewVersion(error, { storage, reload, now: now + 5000 }), false)
  assert.equal(reloads, 1)
  // Another deploy, later on: reload again.
  assert.equal(reloadForNewVersion(error, { storage, reload, now: now + CHUNK_RELOAD_WINDOW_MS }), true)
  assert.equal(reloads, 2)
  // Long messages are cut short.
  store.clear()
  reloadForNewVersion(new Error('m'.repeat(1000)), { storage, reload, now })
  assert.equal(JSON.parse(store.get(STORAGE_KEYS.chunkReload)).message.length, 300)
})

test('reloadForNewVersion: without storage it never reloads (the guard could not hold)', () => {
  let reloads = 0
  const reload = () => { reloads += 1 }
  const blocked = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') } }
  const readOnly = { getItem: () => null, setItem: () => { throw new Error('quota') } }
  for (const storage of [blocked, readOnly, null]) {
    assert.equal(reloadForNewVersion(new Error('x'), { storage, reload, now: 1 }), false)
  }
  assert.equal(reloads, 0)
})
