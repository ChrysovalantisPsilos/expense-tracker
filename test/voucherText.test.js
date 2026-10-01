// The meal vouchers' words (src/features/vouchers/voucherText.js).
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  countryOptions, daysFixParts, monthOfKey, nextTopUpText, voucherCardParts, voucherHistoryParts, voucherPageParts,
} from '../src/features/vouchers/voucherText.js'
import { voucherHistory } from '../src/features/vouchers/voucherMath.js'
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

test('vouchers: the page’s card, this month’s top-ups and spending', () => {
  assert.deepEqual(voucherPageParts(SETTINGS, { balance: 5625, monthTopUps: 16800, monthSpent: 790 }), {
    balance: '€56.25', tone: 'default',
    topUps: { text: '+€168.00', tone: 'positive' },
    spent: { text: '−€7.90', tone: 'default' },
  })
  const quiet = voucherPageParts(SETTINGS, { balance: -100, monthTopUps: 0, monthSpent: 0 })
  assert.equal(quiet.tone, 'negative')
  assert.deepEqual([quiet.topUps.tone, quiet.spent.tone], ['muted', 'muted'])
})

test('vouchers: Fix days’ words and the stepper’s ends', () => {
  const parts = daysFixParts(SETTINGS, '2026-09', 20)
  assert.equal(parts.label, 'Days worked in September')
  assert.deepEqual(parts.total, { perDay: '€8.00', amount: '€160.00' })
  assert.equal(parts.hint, 'The calendar says 22 working days. Take off days you were on leave or sick.')
  assert.deepEqual([parts.fewer, parts.more], [true, true])
  assert.deepEqual([daysFixParts(SETTINGS, '2026-09', 0).fewer, daysFixParts(SETTINGS, '2026-09', 31).more], [false, false])
})

test('vouchers: the history’s lines', () => {
  const lunch = { id: 't1', kind: 'expense', paid_with_vouchers: true, spent_at: '2026-09-05', amount_minor: 790,
    currency: 'EUR', exchange_rate: 1, description: 'Lunch', categories: { name: 'Eating out', color: null } }
  const groups = voucherHistoryParts(SETTINGS, voucherHistory(SETTINGS, [lunch], '2026-09-28'), new Date(2026, 8, 28))
  assert.deepEqual(groups.map((g) => [g.heading, g.net]), [
    ['September', { text: '+€160.10', tone: 'positive' }],
    ['August', { text: '€0.00', tone: 'muted' }],
  ])
  const [spend, topup] = groups[0].items
  assert.equal(spend.key, 'spend-t1')
  assert.equal(spend.row, lunch)
  assert.deepEqual([spend.title, spend.meta, spend.amount], ['Lunch', '5 Sep · Eating out', '−€7.90'])
  assert.deepEqual([topup.key, topup.title, topup.meta, topup.amount, topup.tone],
    ['topup-2026-09-05', 'Top-up', '5 Sep · August · 21 days', '+€168.00', 'positive'])
  const start = groups[1].items[0]
  assert.deepEqual([start.title, start.meta, start.amount, start.tone],
    ['On your card', '20 Aug · when you set it up', '€34.50', 'muted'])
})

test('vouchers: the working-days choices', () => {
  assert.deepEqual(countryOptions().map((c) => c.value), ['BE', 'GR'])
  assert.equal(countryOptions()[1].label, 'Mon–Fri, minus Greek holidays')
})
