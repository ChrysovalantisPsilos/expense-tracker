// The AI helpers' rules on the device (src/features/ai/aiMath.js).
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  AI_SWITCHES, aiErrorKey, applySuggestions, categoryLabels, fillPlan, helpersOn, isSuggested, monthStartOf,
  settlePendingCategory, shouldAutoWrite, suggestionRequest, summaryState,
} from '../src/features/ai/aiMath.js'
import { MERCHANTS_MAX } from '../supabase/functions/_shared/aiHelper.ts'
import en from '../src/locales/en/ai.js'

test('helpers: each one on only by its own switch; none for the demo or before the profile loads', () => {
  const profile = { ai_quick_entry: true, ai_import_categories: false, ai_month_summary: true }
  assert.deepEqual(helpersOn(profile, false), { quickEntry: true, importCategories: false, monthSummary: true })
  assert.deepEqual(helpersOn(profile, true), { quickEntry: false, importCategories: false, monthSummary: false })
  assert.deepEqual(helpersOn(null, false), { quickEntry: false, importCategories: false, monthSummary: false })
  // Every switch has its words in Settings.
  for (const id of Object.keys(AI_SWITCHES)) assert.ok(en.settings[id]?.label && en.settings[id]?.more, id)
})

test('month start and category labels', () => {
  assert.equal(monthStartOf('2026-09-29'), '2026-09-01')
  assert.deepEqual(categoryLabels([{ id: 'a', name: 'Food', default_key: 'food' }], (c) => `«${c.name}»`), { a: '«Food»' })
  assert.deepEqual(categoryLabels(null, String), {})
})

const current = { kind: 'expense', amount: '', currency: 'EUR', categoryId: 'old', description: 'mine', spentAt: '2026-09-29', paidFrom: 'bank' }

test('Type it: the entry fills the form, amounts as the field shows them', () => {
  const { next, marked } = fillPlan({
    kind: 'expense', amount_minor: 360, currency: 'EUR', date: '2026-09-28', category_id: 'food', description: 'Coffee',
  }, current)
  assert.deepEqual(next, { kind: 'expense', currency: 'EUR', amount: '3.60', spentAt: '2026-09-28', categoryId: 'food', description: 'Coffee', paidFrom: 'bank' })
  assert.deepEqual(marked, ['amount', 'date', 'category', 'description'])
  // Yen stay whole.
  assert.equal(fillPlan({ kind: 'expense', amount_minor: 1800, currency: 'JPY' }, current).next.amount, '1800')
})

test('Type it: what the server left empty keeps the form\'s value (the category only for the same kind)', () => {
  const same = fillPlan({ kind: 'expense', amount_minor: 1250, currency: 'EUR', date: null, category_id: null, description: null }, current)
  assert.deepEqual(same.next, { kind: 'expense', currency: 'EUR', amount: '12.50', spentAt: '2026-09-29', categoryId: 'old', description: 'mine', paidFrom: 'bank' })
  assert.deepEqual(same.marked, ['amount'])
  const other = fillPlan({ kind: 'income', amount_minor: 279200, currency: 'EUR', date: null, category_id: null, description: null, paid_from: null }, current)
  assert.equal(other.next.categoryId, '')
  assert.equal(other.next.kind, 'income')
  assert.equal(other.next.paidFrom, 'bank')
})

test('Type it: "Paid from" is filled, and marked unless it is the bank the form already had', () => {
  const entry = { kind: 'expense', amount_minor: 900, currency: 'EUR', date: null, category_id: null, description: null }
  const vouchers = fillPlan({ ...entry, paid_from: 'vouchers' }, current)
  assert.equal(vouchers.next.paidFrom, 'vouchers')
  assert.deepEqual(vouchers.marked, ['amount', 'paidFrom'])
  assert.deepEqual(fillPlan({ ...entry, paid_from: 'savings' }, current).marked, ['amount', 'paidFrom'])
  // The bank, where it already was: filled but not pointed at.
  const bank = fillPlan({ ...entry, paid_from: 'bank' }, current)
  assert.deepEqual([bank.next.paidFrom, bank.marked], ['bank', ['amount']])
  // The bank, where the form had vouchers: a change, so it's marked.
  assert.deepEqual(fillPlan({ ...entry, paid_from: 'bank' }, { ...current, paidFrom: 'vouchers' }).marked, ['amount', 'paidFrom'])
  // Nothing (only the bank, or dropped as not one of the choices): the form keeps its own.
  assert.equal(fillPlan({ ...entry, paid_from: null }, { ...current, paidFrom: 'savings' }).next.paidFrom, 'savings')
})

test('a category waits for its kind\'s list, then is picked or given up', () => {
  const exp = [{ id: 'e1', kind: 'expense' }]
  const inc = [{ id: 's1', kind: 'income' }, { id: 's2', kind: 'income' }]
  assert.deepEqual(settlePendingCategory(null, exp, false), { pick: null, done: true })
  assert.deepEqual(settlePendingCategory({ id: '', kind: 'income' }, exp, false), { pick: '', done: true })
  // Still the expense list on screen (switching kinds): wait.
  assert.deepEqual(settlePendingCategory({ id: 's1', kind: 'income' }, exp, false), { pick: null, done: false })
  assert.deepEqual(settlePendingCategory({ id: 's1', kind: 'income' }, [], true), { pick: null, done: false })
  assert.deepEqual(settlePendingCategory({ id: 's1', kind: 'income' }, inc, false), { pick: 's1', done: true })
  // The income list has loaded without it (archived since): given up.
  assert.deepEqual(settlePendingCategory({ id: 'gone', kind: 'income' }, inc, false), { pick: null, done: true })
})

test('import: the merchants asked about, and the answers filling only what isn\'t picked', () => {
  const groups = Array.from({ length: MERCHANTS_MAX + 5 }, (_, i) => ({ id: `g${i}`, pattern: `SHOP ${i}`, kind: i === 1 ? 'income' : 'expense', count: 1 }))
  const req = suggestionRequest(groups)
  assert.equal(req.ids.length, MERCHANTS_MAX)
  assert.deepEqual(req.merchants[1], { merchant: 'SHOP 1', kind: 'income' })
  assert.deepEqual(Object.keys(req.merchants[0]).sort(), ['kind', 'merchant'])

  const { assign, suggested } = applySuggestions({ g0: 'mine' }, ['g0', 'g1', 'g2'],
    [{ index: 0, category_id: 'food' }, { index: 1, category_id: 'salary' }, { index: 7, category_id: 'x' }, { index: 2, category_id: null }])
  assert.deepEqual(suggested, { g0: 'food', g1: 'salary' })
  assert.deepEqual(assign, { g0: 'mine', g1: 'salary' })
  assert.equal(isSuggested(suggested, assign, 'g1'), true)
  assert.equal(isSuggested(suggested, assign, 'g0'), false) // the user's own pick
  assert.equal(isSuggested(suggested, { ...assign, g1: 'other' }, 'g1'), false) // changed since
})

test('the month summary card\'s state', () => {
  const summary = { lines: ['x'], lang: 'en' }
  const s = (data, extra = {}) => summaryState({ data, error: null, writing: false, writeFailed: false, lang: 'en', ...extra })
  assert.equal(s(undefined), 'hidden')                    // loading
  assert.equal(s(null), 'hidden')                         // helper off
  assert.equal(s({ summary }, { error: new Error('x') }), 'hidden')
  assert.equal(s({ empty: true, summary: null }), 'hidden')
  assert.equal(s({ empty: false, summary: null }), 'writing') // about to be written
  assert.equal(s({ empty: false, summary: null }, { writeFailed: true }), 'failed')
  assert.equal(s({ summary, stale: false }), 'ready')
  assert.equal(s({ summary, stale: true }), 'stale')
  assert.equal(s({ summary, stale: false }, { lang: 'el' }), 'stale') // written in the other language
  assert.equal(s({ summary, stale: true }, { writing: true }), 'writing')
  // Written by itself once, only when there's spending and nothing yet.
  assert.equal(shouldAutoWrite({ data: { empty: false, summary: null }, attempted: false }), true)
  assert.equal(shouldAutoWrite({ data: { empty: false, summary: null }, attempted: true }), false)
  assert.equal(shouldAutoWrite({ data: { empty: true, summary: null }, attempted: false }), false)
  assert.equal(shouldAutoWrite({ data: { summary, stale: true }, attempted: false }), false)
  assert.equal(shouldAutoWrite({ data: null, attempted: false }), false)
})

test('every ai-helper error code has words', () => {
  for (const code of ['not_configured', 'busy', 'rate_limited', 'off', 'unreadable', 'failed', 'bad_request', undefined]) {
    const key = aiErrorKey(code).replace('ai:errors.', '')
    assert.ok(en.errors[key], `${code} → ${key}`)
  }
})
