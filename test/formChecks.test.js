import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  emailError, amountError, requiredError, fieldErrors, firstInvalid,
} from '../src/shared/lib/formChecks.js'
import { authErrors, AUTH_FIELDS, consentError } from '../src/features/auth/authChecks.js'
import { validatePassword } from '../src/shared/lib/password.js'

test('emailError: empty, malformed and fine', () => {
  assert.equal(emailError(''), 'Enter your email address.')
  assert.equal(emailError('   '), 'Enter your email address.')
  assert.equal(emailError(undefined), 'Enter your email address.')
  for (const bad of ['bad', 'a@b', '@b.co', 'a b@c.de', 'a@b.']) {
    assert.equal(emailError(bad), 'Please enter a valid email address.', bad)
  }
  assert.equal(emailError('a@b.co'), null)
  assert.equal(emailError('  alex.m+tag@example.co.uk '), null)
})

test('amountError: needs a positive number', () => {
  for (const bad of ['', null, undefined, '0', '0.00', '-3', 'abc', '.']) {
    assert.equal(amountError(bad), 'Enter an amount', String(bad))
  }
  assert.equal(amountError('0.01'), null)
  assert.equal(amountError('18.5'), null)
  assert.equal(amountError('1200'), null)
})

test('requiredError: blank or spaces get the message', () => {
  assert.equal(requiredError('', 'Add a description'), 'Add a description')
  assert.equal(requiredError('  ', 'Add a description'), 'Add a description')
  assert.equal(requiredError(null, 'Who paid?'), 'Who paid?')
  assert.equal(requiredError('Taxi', 'Add a description'), null)
})

test('fieldErrors keeps only fields with a message; firstInvalid follows the order', () => {
  const errs = fieldErrors({ a: null, b: 'B wrong', c: 'C wrong' })
  assert.deepEqual(errs, { b: 'B wrong', c: 'C wrong' })
  assert.equal(firstInvalid(errs, ['a', 'c', 'b']), 'c')
  assert.equal(firstInvalid({}, ['a']), null)
})

test('authErrors: signing in needs an email and any password', () => {
  assert.deepEqual(authErrors({ mode: 'signin', email: '', password: '' }), {
    email: 'Enter your email address.', password: 'Enter your password.',
  })
  // No new-password rules or consent on sign-in: the server decides.
  assert.deepEqual(authErrors({ mode: 'signin', email: 'a@b.co', password: 'x' }), {})
})

test('authErrors: signing up applies the password rules and needs consent', () => {
  const errs = authErrors({ mode: 'signup', email: 'bad', password: 'short', accepted: false })
  assert.deepEqual(errs, {
    email: 'Please enter a valid email address.',
    password: validatePassword('short'),
    consent: 'Please accept the Terms of Use and Privacy Notice',
  })
  assert.equal(firstInvalid(errs, AUTH_FIELDS), 'email')
  assert.deepEqual(authErrors({ mode: 'signup', email: 'a@b.co', password: 'password1', accepted: true }), {
    password: validatePassword('password1'),
  })
  assert.deepEqual(authErrors({ mode: 'signup', email: 'a@b.co', password: 'l0ngEnough', accepted: true }), {})
})

test('consentError: signing up (by email or Google) needs the tick; logging in doesn’t', () => {
  assert.equal(consentError({ mode: 'signup', accepted: false }), 'Please accept the Terms of Use and Privacy Notice')
  assert.equal(consentError({ mode: 'signup', accepted: true }), null)
  assert.equal(consentError({ mode: 'signin', accepted: false }), null)
})
