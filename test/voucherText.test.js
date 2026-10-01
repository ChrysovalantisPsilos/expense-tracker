// The meal vouchers' words (src/features/vouchers/voucherText.js).
import test from 'node:test'
import assert from 'node:assert/strict'
import { monthOfKey, nextTopUpText, voucherCardParts } from '../src/features/vouchers/voucherText.js'
import { setLanguage } from '../mobile-core/index.js'

const SETTINGS = { v: 1, country: 'BE', per_day_minor: 800, currency: 'EUR', topup_day: 5, start_on: '2026-08-20',
  start_balance_minor: 3450, days: {} }

test('vouchers: a month key’s name', () => {
  assert.equal(monthOfKey('2026-09'), 'September')
})

test('vouchers: the next top-up’s two lines, and “your days” once fixed', () => {
  const next = { on: '2026-10-05', month: '2026-09', days: 22, amount_minor: 17600, fixed: false }
  assert.deepEqual(nextTopUpText(SETTINGS, next), {
    amount: '+€176.00 on 5 Oct',
    why: 'September · 22 working days × €8.00',
  })
  assert.equal(nextTopUpText(SETTINGS, { ...next, days: 1, amount_minor: 800, fixed: true }).why,
    'September · 1 working day × €8.00 · your days')
})

test('vouchers: the Home card’s balance (red below zero) and next top-up', () => {
  const next = { on: '2026-10-05', month: '2026-09', days: 22, amount_minor: 17600, fixed: false }
  const parts = voucherCardParts(SETTINGS, { balance: 5625 }, next)
  assert.equal(parts.balance, '€56.25')
  assert.equal(parts.tone, 'default')
  assert.equal(parts.next.amount, '+€176.00 on 5 Oct')
  const owed = voucherCardParts(SETTINGS, { balance: -1200 }, next)
  assert.equal(owed.tone, 'negative')
  assert.match(owed.balance, /^−€12\.00$/)
})

test('vouchers: the words follow the language', () => {
  setLanguage('el')
  try {
    const next = { on: '2026-10-05', month: '2026-09', days: 22, amount_minor: 17600, fixed: false }
    assert.match(nextTopUpText(SETTINGS, next).why, /^Σεπτέμβριος/)
  } finally {
    setLanguage('en')
  }
})
