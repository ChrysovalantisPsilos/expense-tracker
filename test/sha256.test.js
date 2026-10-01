import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { sha256 } from '../src/shared/lib/sha256.js'

const hex = (bytes) => Buffer.from(bytes).toString('hex')

test('sha256: the standard test vectors', () => {
  assert.equal(hex(sha256('')), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  assert.equal(hex(sha256('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  assert.equal(hex(sha256('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')),
    '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1')
})

test('sha256: the UTF-8 bytes of any text, across block boundaries, as Node hashes them', () => {
  const cases = ['Καφές ☕ 𝄞', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(63), 'a'.repeat(64), 'é'.repeat(700),
    'import|u1|2026-01-01|100|EUR|expense|LIDL LEUVEN|0', '\ud800 lone surrogate']
  for (const s of cases) {
    assert.equal(hex(sha256(s)), createHash('sha256').update(new TextEncoder().encode(s)).digest('hex'), s)
  }
})
