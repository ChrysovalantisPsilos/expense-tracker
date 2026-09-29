import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileStem, toBlob } from '../src/shared/lib/download.js'

test('fileStem: collapses unsafe runs to one dash and trims the ends; falls back when nothing safe is left', () => {
  assert.equal(fileStem('Trip to Lisbon!'), 'Trip-to-Lisbon')
  assert.equal(fileStem('  ../../etc/passwd '), 'etc-passwd')
  assert.equal(fileStem('Café & Co'), 'Caf-Co')
  // Falls back when nothing safe is left.
  assert.equal(fileStem('🍕🍕', 'group'), 'group')
  assert.equal(fileStem(null), 'file')
  assert.equal(fileStem(''), 'file')
})

test('toBlob: passes a Blob of the right (or no requested) type through untouched', () => {
  const b = new Blob(['x'], { type: 'application/pdf' })
  assert.equal(toBlob(b, 'application/pdf'), b)
  assert.equal(toBlob(b), b)
})

test('toBlob: re-types a Blob, keeping its bytes (a spreadsheet arrives as octet-stream)', async () => {
  const b = new Blob([new Uint8Array([80, 75, 3, 4, 255])], { type: 'application/octet-stream' })
  const xlsx = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  const out = toBlob(b, xlsx)
  assert.equal(out.type, xlsx)
  assert.deepEqual(new Uint8Array(await out.arrayBuffer()), new Uint8Array([80, 75, 3, 4, 255]))
})

test('toBlob: wraps binary/string data with the given type; serialises a plain object as JSON', async () => {
  const bytes = new Uint8Array([37, 80, 68, 70])
  const b = toBlob(bytes, 'application/pdf')
  assert.equal(b.type, 'application/pdf')
  assert.deepEqual(new Uint8Array(await b.arrayBuffer()), bytes)
  assert.equal(await toBlob('hi').text(), 'hi')
  // A plain object is serialised as JSON.
  assert.equal(await toBlob({ error: 'nope' }).text(), '{"error":"nope"}')
})
