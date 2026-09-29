import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validatePassword } from '../src/shared/lib/password.js'

test('validatePassword: accepts a reasonable password; length, letter, and number rules', () => {
  assert.equal(validatePassword('sunflower7'), null)
  assert.equal(validatePassword('Tr0ubador!'), null)
  assert.equal(validatePassword('ab12'), 'Use at least 8 characters.')
  assert.equal(validatePassword('12345678'), 'Include at least one letter.')
  assert.equal(validatePassword('abcdefgh'), 'Include at least one number.')
})

test('validatePassword: rejects common passwords (case-insensitive)', () => {
  // Only common passwords that already pass length/letter/number reach this check.
  assert.match(validatePassword('password1'), /too common/)
  assert.match(validatePassword('PASSWORD1'), /too common/)
})
