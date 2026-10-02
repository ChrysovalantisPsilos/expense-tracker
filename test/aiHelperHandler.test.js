// The ai-helper edge function's handler (supabase/functions/ai-helper/
// handler.ts) with a stubbed Supabase client and a stubbed Claude call:
// who may call, what is checked first, and what reaches the app.
import test from 'node:test'
import assert from 'node:assert/strict'
import { handle } from '../supabase/functions/ai-helper/handler.ts'

const UID = '00000000-0000-4000-8000-0000000000aa'
const FOOD = '00000000-0000-4000-8000-000000000001'
const today = new Date().toISOString().slice(0, 10)
const month = `${today.slice(0, 8)}01`

const SAVED = '00000000-0000-4000-8000-000000000002'
const FOOD_ROW = { id: FOOD, name: 'Food', kind: 'expense', is_archived: false, is_savings: false }
const SAVINGS_ROW = { id: SAVED, name: 'Savings', kind: 'income', is_archived: true, is_savings: true }

function stubs({
  user = { id: UID }, start = { data: { base_currency: 'EUR' } }, summary = null, reply, save = {},
  categories = [FOOD_ROW], vouchers = null, rules = [],
} = {}) {
  const calls = { rpc: [], asks: [], service: [] }
  const asUser = {
    auth: { getUser: async () => ({ data: { user } }) },
    rpc: async (fn, args) => {
      calls.rpc.push([fn, args])
      if (fn === 'ai_helper_start') return { data: start.data ?? null, error: start.error ?? null }
      if (fn === 'my_month_summary') return { data: summary, error: null }
      if (fn === 'my_meal_vouchers') return { data: vouchers, error: null }
      if (fn === 'my_recurring_rules') return { data: rules, error: null }
      return { data: null, error: { message: 'unknown rpc' } }
    },
    from: () => ({ select: async () => ({ data: categories, error: null }) }),
  }
  const deps = {
    asUser,
    service: () => ({ rpc: async (fn, args) => { calls.service.push([fn, args]); return { data: null, error: save.error ?? null } } }),
    ask: reply === null ? null : async (a) => { calls.asks.push(a); return reply ?? { ok: false, problem: 'failed' } },
    today: () => today,
  }
  return { deps, calls }
}
const post = (body) => new Request('https://x.test/ai-helper', { method: 'POST', body: JSON.stringify(body) })
const entryReply = { ok: true, json: { understood: true, kind: 'expense', amount: '3.60', currency: 'EUR', date: today, category_id: FOOD, description: 'Coffee' } }

test('signed out: 401, nothing checked or sent', async () => {
  const { deps, calls } = stubs({ user: null, reply: entryReply })
  const r = await handle(post({ action: 'parse_entry', text: 'coffee 3.60', today }), deps)
  assert.equal(r.status, 401)
  assert.equal(calls.asks.length + calls.rpc.length, 0)
})

test('an unknown action or a bad request: 400 before anything else', async () => {
  const { deps, calls } = stubs({ reply: entryReply })
  assert.equal((await handle(post({ action: 'chat', text: 'hi' }), deps)).status, 400)
  assert.equal((await handle(post({ action: 'parse_entry', text: '', today }), deps)).status, 400)
  assert.equal((await handle(new Request('https://x.test', { method: 'GET' }), deps)).status, 405)
  assert.equal(calls.asks.length + calls.rpc.length, 0)
})

test('no API key: not_configured, and the rate limit isn\'t spent', async () => {
  const { deps, calls } = stubs({ reply: null })
  const r = await handle(post({ action: 'parse_entry', text: 'coffee 3.60', today }), deps)
  assert.deepEqual([r.status, r.body.code], [503, 'not_configured'])
  assert.equal(calls.rpc.length, 0)
})

test('the switch is checked server-side: off means 403 and no call to Claude', async () => {
  const { deps, calls } = stubs({ start: { error: { message: 'AI helper is off' } }, reply: entryReply })
  const r = await handle(post({ action: 'parse_entry', text: 'coffee 3.60', today }), deps)
  assert.deepEqual([r.status, r.body.code], [403, 'off'])
  assert.deepEqual(calls.rpc[0], ['ai_helper_start', { p_helper: 'parse_entry' }])
  assert.equal(calls.asks.length, 0)
})

test('over the rate limit: 429 and no call to Claude', async () => {
  const { deps, calls } = stubs({ start: { error: { message: 'Too many requests — please try again later.' } }, reply: entryReply })
  const r = await handle(post({ action: 'suggest_categories', merchants: [{ merchant: 'X', kind: 'expense' }] }), deps)
  assert.deepEqual([r.status, r.body.code], [429, 'rate_limited'])
  assert.equal(calls.asks.length, 0)
})

test('parse_entry: the validated entry comes back', async () => {
  const { deps, calls } = stubs({ reply: entryReply })
  const r = await handle(post({ action: 'parse_entry', text: 'coffee 3.60', today, labels: { [FOOD]: 'Φαγητό' } }), deps)
  assert.equal(r.status, 200)
  assert.deepEqual(r.body.entry, { kind: 'expense', amount_minor: 360, currency: 'EUR', date: today, category_id: FOOD, description: 'Coffee', paid_from: null })
  assert.match(calls.asks[0].user, /Φαγητό/)
  // Only the bank: "Paid from" isn't asked about.
  assert.doesNotMatch(calls.asks[0].user, /paid_from/)
})

test('parse_entry: "Paid from" is offered from what the server finds, never from the request', async () => {
  const lunch = { ...entryReply.json, description: 'Lunch', paid_from: 'vouchers' }
  // Meal vouchers set up (my_meal_vouchers as the caller) and a savings category (even archived).
  let s = stubs({ reply: { ok: true, json: lunch }, vouchers: { per_day_minor: 800 }, categories: [FOOD_ROW, SAVINGS_ROW] })
  let r = await handle(post({ action: 'parse_entry', text: 'lunch 9 with meal vouchers', today, paid_from_options: ['bank'] }), s.deps)
  assert.equal(r.body.entry.paid_from, 'vouchers')
  assert.deepEqual(JSON.parse(s.calls.asks[0].user).paid_from_options, ['bank', 'savings', 'vouchers'])
  assert.deepEqual(s.calls.rpc.find(([fn]) => fn === 'my_meal_vouchers'), ['my_meal_vouchers', {}])
  // No vouchers: a "vouchers" answer isn't one of the choices, so it's dropped.
  s = stubs({ reply: { ok: true, json: lunch }, categories: [FOOD_ROW, SAVINGS_ROW] })
  r = await handle(post({ action: 'parse_entry', text: 'lunch 9 with meal vouchers', today, paid_from_options: ['bank', 'vouchers'] }), s.deps)
  assert.deepEqual(JSON.parse(s.calls.asks[0].user).paid_from_options, ['bank', 'savings'])
  assert.equal(r.body.entry.paid_from, null)
  s = stubs({ reply: { ok: true, json: { ...lunch, paid_from: 'savings' } }, categories: [FOOD_ROW, SAVINGS_ROW] })
  r = await handle(post({ action: 'parse_entry', text: 'from savings 200 flight', today }), s.deps)
  assert.equal(r.body.entry.paid_from, 'savings')
})

test('parse_entry: an unusable answer, a refusal or a cut-off is "unreadable"; the API busy is "busy"', async () => {
  for (const reply of [
    { ok: true, json: { understood: false, kind: 'expense', amount: null } },
    { ok: false, problem: 'refused' },
    { ok: false, problem: 'too_long' },
  ]) {
    const { deps } = stubs({ reply })
    const r = await handle(post({ action: 'parse_entry', text: 'the thing from last week', today }), deps)
    assert.deepEqual([r.status, r.body.code], [422, 'unreadable'])
  }
  const { deps } = stubs({ reply: { ok: false, problem: 'busy' } })
  assert.deepEqual((await handle(post({ action: 'parse_entry', text: 'x 1', today }), deps)).body.code, 'busy')
})

test('suggest_categories: only valid picks, as index + category id', async () => {
  const { deps } = stubs({ reply: { ok: true, json: { suggestions: [{ index: 0, category_id: FOOD }, { index: 1, category_id: 'nope' }] } } })
  const r = await handle(post({ action: 'suggest_categories', merchants: [{ merchant: 'DELHAIZE', kind: 'expense' }, { merchant: 'Y', kind: 'expense' }] }), deps)
  assert.equal(r.status, 200)
  assert.deepEqual(r.body.suggestions, [{ index: 0, category_id: FOOD }])
})

const state = (over = {}) => ({
  empty: false, stale: false, summary: null, fingerprint: 'f'.repeat(32),
  totals: { currency: 'EUR', month: month.slice(0, 7), categories: [{ id: FOOD, name: 'Food', kind: 'expense', totals: [1000, 0, 0, 0, 0, 0, 0], budget: null }] },
  ...over,
})

test('month_summary: off (no state) is 403; an empty month needs no call', async () => {
  let s = stubs({ summary: null, reply: { ok: true, json: { lines: ['x'] } } })
  assert.equal((await handle(post({ action: 'month_summary', month, lang: 'en' }), s.deps)).status, 403)
  s = stubs({ summary: state({ empty: true }), reply: { ok: true, json: { lines: ['x'] } } })
  const r = await handle(post({ action: 'month_summary', month, lang: 'en' }), s.deps)
  assert.deepEqual(r.body, { empty: true })
  assert.equal(s.calls.asks.length, 0)
})

test('month_summary: an up-to-date summary in this language is returned as is', async () => {
  const summary = { lines: ['Food came to €10.'], lang: 'en', written_at: '2026-09-01T10:00:00Z' }
  const s = stubs({ summary: state({ summary }), reply: { ok: true, json: { lines: ['new'] } } })
  const r = await handle(post({ action: 'month_summary', month, lang: 'en' }), s.deps)
  assert.deepEqual(r.body, { summary, stale: false })
  assert.equal(s.calls.asks.length + s.calls.service.length, 0)
  assert.equal(s.calls.rpc.some(([fn]) => fn === 'ai_helper_start'), false)
})

test('month_summary: stale, or another language, writes a new one from the server\'s totals and stores it', async () => {
  const summary = { lines: ['old'], lang: 'en', written_at: '2026-09-01T10:00:00Z' }
  for (const [over, lang] of [[{ summary, stale: true }, 'en'], [{ summary }, 'el']]) {
    const line = lang === 'en' ? 'Food came to €10.00.' : 'Φαγητό: 10,00 € ως τώρα.'
    const s = stubs({ summary: state(over), reply: { ok: true, json: { lines: [`- ${line}`, 'That is €9 over.'] } } })
    // Totals in the request are ignored: only the database's are sent.
    const r = await handle(post({ action: 'month_summary', month, lang, totals: { forged: true } }), s.deps)
    assert.equal(r.status, 200)
    // The line with an amount it wasn't given is left out.
    assert.deepEqual(r.body.summary.lines, [line])
    assert.equal(r.body.summary.lang, lang)
    assert.doesNotMatch(s.calls.asks[0].user, /forged/)
    assert.match(s.calls.asks[0].user, lang === 'en' ? /"€10\.00"/ : /"10,00\u00a0€"/)
    assert.deepEqual(s.calls.service[0], ['ai_save_month_summary',
      { p_user: UID, p_month: month, p_summary: { lines: [line], lang }, p_fingerprint: 'f'.repeat(32) }])
  }
})

test('month_summary: what\'s still due comes from the caller\'s own recurring rules (none when unreadable)', async () => {
  const lastDay = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).toISOString().slice(0, 10)
  const due = { id: '00000000-0000-4000-8000-0000000000c1', kind: 'expense', category_id: FOOD, amount_minor: 4500, currency: 'EUR',
    frequency: 'monthly', interval_n: 1, next_run: lastDay, is_active: true, end_date: null }
  const s = stubs({ summary: state(), rules: [due], reply: { ok: true, json: { lines: ['Food: €45.00 is due.'] } } })
  const r = await handle(post({ action: 'month_summary', month, lang: 'en' }), s.deps)
  assert.equal(r.status, 200)
  assert.ok(s.calls.rpc.some(([fn]) => fn === 'my_recurring_rules'))
  assert.deepEqual(JSON.parse(s.calls.asks[0].user).coming_up, [{ name: 'Food', kind: 'payment', amount: '€45.00', day: Number(lastDay.slice(8)) }])
  assert.deepEqual(r.body.summary.lines, ['Food: €45.00 is due.'])
})

test('month_summary: switched off while writing — nothing kept, 403', async () => {
  const s = stubs({ summary: state(), reply: { ok: true, json: { lines: ['x'] } }, save: { error: { message: 'AI helper is off' } } })
  const r = await handle(post({ action: 'month_summary', month, lang: 'en' }), s.deps)
  assert.equal(r.status, 403)
})

const NETFLIX = '00000000-0000-4000-8000-0000000000b1'
const NETFLIX_RULE = {
  id: NETFLIX, kind: 'expense', description: 'Netflix', amount_minor: 1599, currency: 'EUR', frequency: 'monthly',
  interval_n: 1, is_active: true, next_run: '2026-10-05', end_date: null, category_id: null, categories: null,
}
const whatIfReply = { ok: true, json: {
  understood: true,
  changes: [{ id: NETFLIX, action: 'cancel', amount: null, frequency: null },
    { id: '00000000-0000-4000-8000-0000000000ff', action: 'cancel', amount: null, frequency: null }],
  adds: [{ kind: 'expense', name: 'Gym', amount: '40', currency: null, frequency: 'monthly' }],
  not_found: [],
} }

test('plan_whatif: gated, sent the caller\'s own plan items from the database, answer validated', async () => {
  const { deps, calls } = stubs({ reply: whatIfReply, rules: [NETFLIX_RULE] })
  // Whatever the request says about payments is ignored: only the line counts.
  const r = await handle(post({ action: 'plan_whatif', text: 'cancel Netflix, add a gym at 40 a month',
    payments: [{ id: 'x', name: 'Injected' }] }), deps)
  assert.equal(r.status, 200)
  assert.deepEqual(calls.rpc.map(([fn]) => fn), ['ai_helper_start', 'my_recurring_rules'])
  assert.deepEqual(calls.rpc[0][1], { p_helper: 'plan_whatif' })
  const sent = JSON.parse(calls.asks[0].user)
  assert.deepEqual(sent.items.map((i) => i.id), [NETFLIX])
  assert.ok(!calls.asks[0].user.includes('Injected'))
  assert.deepEqual(r.body.whatif, {
    changes: [{ rule_id: NETFLIX, cancel: true }],
    adds: [{ kind: 'expense', name: 'Gym', amount_minor: 4000, currency: 'EUR', repeat: 'monthly' }],
    notFound: [],
  })
})

test('plan_whatif: off → 403 before anything is read; nothing usable → unreadable', async () => {
  const off = stubs({ start: { error: { message: 'AI helper is off' } }, reply: whatIfReply, rules: [NETFLIX_RULE] })
  const r1 = await handle(post({ action: 'plan_whatif', text: 'cancel Netflix' }), off.deps)
  assert.deepEqual([r1.status, r1.body.code], [403, 'off'])
  assert.deepEqual(off.calls.rpc.map(([fn]) => fn), ['ai_helper_start'])
  assert.equal(off.calls.asks.length, 0)

  const none = stubs({ reply: { ok: true, json: { understood: false, changes: [], adds: [], not_found: [] } }, rules: [NETFLIX_RULE] })
  const r2 = await handle(post({ action: 'plan_whatif', text: 'hello there' }), none.deps)
  assert.deepEqual([r2.status, r2.body.code], [422, 'unreadable'])

  const bad = stubs({ reply: whatIfReply })
  assert.equal((await handle(post({ action: 'plan_whatif', text: '' }), bad.deps)).status, 400)
  assert.equal(bad.calls.rpc.length, 0)
})
