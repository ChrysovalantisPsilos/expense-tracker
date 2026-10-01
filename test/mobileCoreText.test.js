// The core's TextDecoder (mobile-core/textDecoder.js, for an engine without
// one): byte for byte the browser's (Node's) for every encoding the
// statement import reads, malformed input included.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TextDecoder as CoreDecoder } from '../mobile-core/textDecoder.js'

const ENCODINGS = ['utf-8', 'utf-16le', 'utf-16be', 'windows-1252', 'windows-1253']

// A small deterministic generator (no Math.random in tests that must repeat).
function* bytesSeries(seed) {
  let s = seed
  for (let n = 0; n < 400; n++) {
    const len = n % 23
    const out = new Uint8Array(len)
    for (let i = 0; i < len; i++) {
      s = (s * 1103515245 + 12345) >>> 0
      // Lean on the high bytes where the encodings differ.
      out[i] = (s >>> 16) & 0xff | (n % 3 ? 0x80 : 0)
    }
    yield out
  }
}

function same(encoding, bytes, fatal) {
  let want
  let got
  try { want = new TextDecoder(encoding, { fatal }).decode(bytes) } catch (e) { want = e.constructor.name }
  try { got = new CoreDecoder(encoding, { fatal }).decode(bytes) } catch (e) { got = e.constructor.name }
  assert.equal(got, want, `${encoding} fatal=${fatal} [${[...bytes].map((b) => b.toString(16)).join(' ')}]`)
}

test('core TextDecoder: every single byte, and random runs, decode as the browser\'s', () => {
  for (const encoding of ENCODINGS) {
    for (let b = 0; b < 256; b++) same(encoding, new Uint8Array([b]), false)
    for (const fatal of [false, true]) {
      for (const bytes of bytesSeries(encoding.length * 7 + (fatal ? 1 : 0))) same(encoding, bytes, fatal)
    }
  }
})

test('core TextDecoder: real text, byte-order marks, surrogates and cut-off sequences', () => {
  const greek = 'Καφές ☕ 𝄞 Αθήνα'
  const utf8 = new TextEncoder().encode(greek)
  const cases = [
    utf8, Uint8Array.from([0xef, 0xbb, 0xbf, ...utf8]), utf8.subarray(0, utf8.length - 1),
    Uint8Array.from([0xe0, 0x80, 0x80]), Uint8Array.from([0xed, 0xa0, 0x80]), Uint8Array.from([0xf4, 0x90, 0x80, 0x80]),
    Uint8Array.from([0xc0, 0xaf]), Uint8Array.from([0xff, 0xfe, 0x3d, 0xd8, 0x00, 0xde]), Uint8Array.from([0x3d, 0xd8, 0x41, 0x00]),
    Uint8Array.from([0x00, 0xdc, 0x41]), new Uint8Array(0),
  ]
  for (const encoding of ENCODINGS) {
    for (const bytes of cases) for (const fatal of [false, true]) same(encoding, bytes, fatal)
  }
  assert.equal(new CoreDecoder('utf-8').decode(utf8), greek)
  assert.throws(() => new CoreDecoder('koi8-r'), RangeError)
})
