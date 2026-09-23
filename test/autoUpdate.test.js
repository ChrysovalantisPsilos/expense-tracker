import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isSafeToReload } from '../src/shared/lib/autoUpdate.js'

const doc = ({ hidden = false, active = null, dialog = false } = {}) => ({
  visibilityState: hidden ? 'hidden' : 'visible',
  activeElement: active,
  querySelector: () => (dialog ? {} : null),
})

test('isSafeToReload: idle visible page is safe', () => {
  assert.equal(isSafeToReload(doc({ active: { tagName: 'BODY' } })), true)
})

test('isSafeToReload: typing in a field or an open dialog is not safe', () => {
  assert.equal(isSafeToReload(doc({ active: { tagName: 'INPUT' } })), false)
  assert.equal(isSafeToReload(doc({ active: { tagName: 'TEXTAREA' } })), false)
  assert.equal(isSafeToReload(doc({ active: { tagName: 'DIV', isContentEditable: true } })), false)
  assert.equal(isSafeToReload(doc({ dialog: true })), false)
})

test('isSafeToReload: a hidden tab is always safe', () => {
  assert.equal(isSafeToReload(doc({ hidden: true, active: { tagName: 'INPUT' }, dialog: true })), true)
})
