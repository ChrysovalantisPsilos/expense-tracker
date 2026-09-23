import { test } from 'node:test'
import assert from 'node:assert/strict'
import { revolutUrl, paypalUrl, normalisePaypalHandle } from '../src/shared/lib/payLinks.js'

test('revolutUrl: the amount in minor units plus the currency', () => {
  assert.equal(revolutUrl('alexk', 8925, 'EUR'), 'https://revolut.me/alexk?currency=EUR&amount=8925')
  assert.equal(revolutUrl('@alexk', 1800, 'JPY'), 'https://revolut.me/alexk?currency=JPY&amount=1800')
  assert.equal(revolutUrl('alexk', 0, 'EUR'), 'https://revolut.me/alexk')
  assert.equal(revolutUrl('alexk', 500, null), 'https://revolut.me/alexk')
  assert.equal(revolutUrl('a/b?c', 100, 'EUR'), 'https://revolut.me/a%2Fb%3Fc?currency=EUR&amount=100')
  assert.equal(revolutUrl('  ', 100, 'EUR'), null)
})

test('normalisePaypalHandle: accepts pasted links and @names, rejects anything else', () => {
  assert.equal(normalisePaypalHandle('AlexK'), 'AlexK')
  assert.equal(normalisePaypalHandle('@AlexK'), 'AlexK')
  assert.equal(normalisePaypalHandle('paypal.me/AlexK'), 'AlexK')
  assert.equal(normalisePaypalHandle('https://www.paypal.me/AlexK/10EUR'), 'AlexK')
  assert.equal(normalisePaypalHandle('alex k'), null)
  assert.equal(normalisePaypalHandle('x'.repeat(21)), null)
  assert.equal(normalisePaypalHandle('javascript:alert(1)'), null)
  assert.equal(normalisePaypalHandle(''), null)
})

test('paypalUrl: paypal.me/<name>/<amount><CUR> in major units', () => {
  assert.equal(paypalUrl('AlexK', 8925, 'EUR'), 'https://paypal.me/AlexK/89.25EUR')
  assert.equal(paypalUrl('AlexK', 1800, 'JPY'), 'https://paypal.me/AlexK/1800JPY')
  assert.equal(paypalUrl('AlexK', 5, 'USD'), 'https://paypal.me/AlexK/0.05USD')
  assert.equal(paypalUrl('AlexK', 0, 'EUR'), 'https://paypal.me/AlexK')
  assert.equal(paypalUrl('bad name', 100, 'EUR'), null)
})
