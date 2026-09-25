import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveMode, toggledPref } from '../src/shared/lib/themePref.js'

test('system follows the device; light and dark are pinned', () => {
  assert.equal(resolveMode('system', true), 'dark')
  assert.equal(resolveMode('system', false), 'light')
  assert.equal(resolveMode('light', true), 'light')
  assert.equal(resolveMode('dark', false), 'dark')
})

test('the quick toggle pins the opposite of the device', () => {
  assert.equal(toggledPref(false, false), 'dark') // light device, showing light
  assert.equal(toggledPref(true, true), 'light') // dark device, showing dark
})

test('toggling back to what the device shows follows the device again', () => {
  assert.equal(toggledPref(true, false), 'system') // pinned dark on a light device
  assert.equal(toggledPref(false, true), 'system') // pinned light on a dark device
})
