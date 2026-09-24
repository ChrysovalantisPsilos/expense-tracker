import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  revolutUrl, paypalUrl, normalisePaypalHandle, sepaQrPayload, hasPaymentDetails, askForPaymentDetails,
} from '../src/shared/lib/payLinks.js'

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

test('sepaQrPayload: EPC069-12 lines, and a new amount is a new payload', () => {
  const p = sepaQrPayload({ name: 'Alex', iban: 'BE71096123456769', amountMinor: 8925, reference: 'Budgeer settle-up · Trip' })
  assert.deepEqual(p.split('\n'),
    ['BCD', '002', '1', 'SCT', '', 'Alex', 'BE71096123456769', 'EUR89.25', '', '', 'Budgeer settle-up · Trip'])
  assert.notEqual(sepaQrPayload({ name: 'Alex', iban: 'BE71096123456769', amountMinor: 5000, reference: 'Budgeer settle-up · Trip' }), p)
  const long = sepaQrPayload({ name: 'x'.repeat(90), iban: 'BE71096123456769', amountMinor: 1, reference: 'r'.repeat(200) }).split('\n')
  assert.equal(long[5].length, 70)
  assert.equal(long[7], 'EUR0.01')
  assert.equal(long[10].length, 140)
  assert.equal(sepaQrPayload({ name: '', iban: 'X', amountMinor: 100 }).split('\n')[5], 'Payee')
})

test('hasPaymentDetails: any one of IBAN, Revolut or PayPal.me', () => {
  assert.equal(hasPaymentDetails({}), false)
  assert.equal(hasPaymentDetails(null), false)
  assert.equal(hasPaymentDetails({ payment_iban: '  ', payment_revolut: null }), false)
  assert.equal(hasPaymentDetails({ payment_iban: 'BE68539007547034' }), true)
  assert.equal(hasPaymentDetails({ payment_revolut: 'alexk' }), true)
  assert.equal(hasPaymentDetails({ payment_paypal: 'AlexK' }), true)
})

test('askForPaymentDetails: only when being paid, loaded, none saved and not dismissed', () => {
  const base = { direction: 'in', info: {}, dismissed: false }
  assert.equal(askForPaymentDetails(base), true)
  assert.equal(askForPaymentDetails({ ...base, direction: 'out' }), false)
  assert.equal(askForPaymentDetails({ ...base, info: null }), false) // not loaded (or failed)
  assert.equal(askForPaymentDetails({ ...base, dismissed: true }), false)
  assert.equal(askForPaymentDetails({ ...base, info: { payment_revolut: 'alexk' } }), false)
})
