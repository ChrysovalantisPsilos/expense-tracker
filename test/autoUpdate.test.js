import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isSafeToReload, unsavedFormAttr, UNSAVED_FORM_ATTR } from '../src/shared/lib/autoUpdate.js'

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
