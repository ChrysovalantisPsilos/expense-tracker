import { test } from 'node:test'
import assert from 'node:assert/strict'
import { appearancePrefs, resolveMode, toggledPref } from '../src/shared/lib/themePref.js'

test('the choices Appearance offers, in order', () => {
  assert.deepEqual(appearancePrefs(), ['light', 'dark', 'system'])
})

test('system follows the device; light and dark are pinned', () => {
  assert.equal(resolveMode('system', true), 'dark')
  assert.equal(resolveMode('system', false), 'light')
  assert.equal(resolveMode('light', true), 'light')
  assert.equal(resolveMode('dark', false), 'dark')
})

test('the quick toggle pins the opposite of the device; toggling back to what it shows follows the device again', () => {
  assert.equal(toggledPref(false, false), 'dark') // light device, showing light
  assert.equal(toggledPref(true, true), 'light') // dark device, showing dark
  assert.equal(toggledPref(true, false), 'system') // pinned dark on a light device
  assert.equal(toggledPref(false, true), 'system') // pinned light on a dark device
})
