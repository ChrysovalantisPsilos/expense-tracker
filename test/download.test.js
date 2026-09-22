import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileStem, toBlob } from '../src/shared/lib/download.js'

test('fileStem: collapses unsafe runs to one dash and trims the ends', () => {
  assert.equal(fileStem('Trip to Lisbon!'), 'Trip-to-Lisbon')
  assert.equal(fileStem('  ../../etc/passwd '), 'etc-passwd')
  assert.equal(fileStem('Café & Co'), 'Caf-Co')
})

test('fileStem: falls back when nothing safe is left', () => {
  assert.equal(fileStem('🍕🍕', 'group'), 'group')
  assert.equal(fileStem(null), 'file')
  assert.equal(fileStem(''), 'file')
})

test('toBlob: passes a Blob through untouched', () => {
  const b = new Blob(['x'], { type: 'application/pdf' })
  assert.equal(toBlob(b, 'text/plain'), b)
})

test('toBlob: wraps binary/string data with the given type', async () => {
  const bytes = new Uint8Array([37, 80, 68, 70])
  const b = toBlob(bytes, 'application/pdf')
  assert.equal(b.type, 'application/pdf')
  assert.deepEqual(new Uint8Array(await b.arrayBuffer()), bytes)
  assert.equal(await toBlob('hi').text(), 'hi')
})

test('toBlob: serialises a plain object as JSON', async () => {
  assert.equal(await toBlob({ error: 'nope' }).text(), '{"error":"nope"}')
})
