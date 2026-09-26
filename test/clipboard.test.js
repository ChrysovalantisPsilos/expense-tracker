import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { copyText } from '../src/shared/lib/clipboard.js'

const realItem = globalThis.ClipboardItem
afterEach(() => { globalThis.ClipboardItem = realItem })

class FakeItem { constructor(data) { this.data = data } }

test('text that only exists later is written through a ClipboardItem started right away', async () => {
  globalThis.ClipboardItem = FakeItem
  let started = false
  let written = null
  const clipboard = {
    async write([item]) { started = true; written = await (await item.data['text/plain']).text() },
    async writeText() { throw new Error('should not be used') },
  }
  const later = new Promise((r) => setTimeout(() => r('https://budgeer.com/join/abc'), 5))
  const done = copyText(later, clipboard)
  assert.equal(started, true, 'the write starts before the text is ready (inside the tap)')
  assert.equal(await done, true)
  assert.equal(written, 'https://budgeer.com/join/abc')
})

test('falls back to writeText when ClipboardItem is missing or refused', async () => {
  globalThis.ClipboardItem = undefined
  let got = null
  assert.equal(await copyText('hello', { async writeText(t) { got = t } }), true)
  assert.equal(got, 'hello')

  globalThis.ClipboardItem = FakeItem
  got = null
  const refusing = {
    async write() { throw Object.assign(new Error('no'), { name: 'NotAllowedError' }) },
    async writeText(t) { got = t },
  }
  assert.equal(await copyText(Promise.resolve('x'), refusing), true)
  assert.equal(got, 'x')
})

test('a refused clipboard resolves false instead of throwing (iPhone after an await)', async () => {
  globalThis.ClipboardItem = undefined
  const refuse = { async writeText() { throw Object.assign(new Error('denied'), { name: 'NotAllowedError' }) } }
  assert.equal(await copyText('x', refuse), false)
  assert.equal(await copyText('x', undefined), false)
})

test('a text that fails to arrive is reported as not copied; the caller sees the real error', async () => {
  globalThis.ClipboardItem = undefined
  const failing = Promise.reject(new Error('invite limit reached'))
  failing.catch(() => {})
  assert.equal(await copyText(failing, { async writeText() {} }), false)
  await assert.rejects(failing, /invite limit reached/)
})
