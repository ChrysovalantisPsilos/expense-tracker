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

function stubs({ user = { id: UID }, start = { data: { base_currency: 'EUR' } }, summary = null, reply, save = {} } = {}) {
  const calls = { rpc: [], asks: [], service: [] }
  const asUser = {
    auth: { getUser: async () => ({ data: { user } }) },
    rpc: async (fn, args) => {
      calls.rpc.push([fn, args])
      if (fn === 'ai_helper_start') return { data: start.data ?? null, error: start.error ?? null }
      if (fn === 'my_month_summary') return { data: summary, error: null }
      return { data: null, error: { message: 'unknown rpc' } }
    },
    from: () => ({ select: async () => ({ data: [{ id: FOOD, name: 'Food', kind: 'expense', is_archived: false }], error: null }) }),
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
  assert.deepEqual(r.body.entry, { kind: 'expense', amount_minor: 360, currency: 'EUR', date: today, category_id: FOOD, description: 'Coffee' })
  assert.match(calls.asks[0].user, /Φαγητό/)
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
    const s = stubs({ summary: state(over), reply: { ok: true, json: { lines: ['- Food came to €10.'] } } })
    // Totals in the request are ignored: only the database's are sent.
    const r = await handle(post({ action: 'month_summary', month, lang, totals: { forged: true } }), s.deps)
    assert.equal(r.status, 200)
    assert.deepEqual(r.body.summary.lines, ['Food came to €10.'])
    assert.equal(r.body.summary.lang, lang)
    assert.doesNotMatch(s.calls.asks[0].user, /forged/)
    assert.match(s.calls.asks[0].user, /"10.00"/)
    assert.deepEqual(s.calls.service[0], ['ai_save_month_summary',
      { p_user: UID, p_month: month, p_summary: { lines: ['Food came to €10.'], lang }, p_fingerprint: 'f'.repeat(32) }])
  }
})

test('month_summary: switched off while writing — nothing kept, 403', async () => {
  const s = stubs({ summary: state(), reply: { ok: true, json: { lines: ['x'] } }, save: { error: { message: 'AI helper is off' } } })
  const r = await handle(post({ action: 'month_summary', month, lang: 'en' }), s.deps)
  assert.equal(r.status, 403)
})
