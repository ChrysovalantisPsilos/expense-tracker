// The shared demo account (0090): who counts as one, and the refusal's words,
// which the database, the edge functions and the app must all use alike.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { latestSql } from './migrations.js'
import { DEMO_REFUSAL, isDemoAccount } from '../src/shared/lib/demoAccount.js'
import { SQL_USER_MESSAGES, userMessage } from '../src/shared/lib/errors.js'
import { DEMO_REFUSAL as EDGE_REFUSAL, isDemoCaller } from '../supabase/functions/_shared/demo.ts'

test('only an explicit is_demo = true is a demo account', () => {
  assert.equal(isDemoAccount({ is_demo: true }), true)
  for (const p of [null, undefined, {}, { is_demo: false }, { is_demo: 'true' }, { is_demo: 1 }]) {
    assert.equal(isDemoAccount(p), false, JSON.stringify(p))
  }
})

test('the demo refusal reads the same in SQL, the edge functions and the app', () => {
  assert.equal(EDGE_REFUSAL, DEMO_REFUSAL)
  assert.ok(latestSql('refuse_if_demo').includes(`raise exception '${DEMO_REFUSAL}'`))
  assert.ok(SQL_USER_MESSAGES.has(DEMO_REFUSAL))
  assert.equal(userMessage(Object.assign(new Error(DEMO_REFUSAL), { code: 'P0001' }), 'fallback'), DEMO_REFUSAL)
})

test('the functions that delete an account or send email refuse a demo caller first', () => {
  for (const fn of ['delete-account', 'privacy-request', 'send-invite']) {
    const src = readFileSync(new URL(`../supabase/functions/${fn}/index.ts`, import.meta.url), 'utf8')
    const check = src.indexOf('isDemoCaller(asUser, user.id)')
    assert.ok(check > 0, `${fn} doesn't check for the demo`)
    for (const later of ['sendEmail(', 'deleteAccount(', "rpc('consume_quota'"]) {
      const at = src.indexOf(later)
      if (at >= 0) assert.ok(at > check, `${fn}: ${later} runs before the demo check`)
    }
  }
})

// A stand-in for the caller-scoped client: answers one profiles read.
const client = (answer) => ({
  from: (table) => ({
    select: (cols) => ({
      eq: (col, v) => ({
        maybeSingle: async () => {
          assert.deepEqual([table, cols, col, v], ['profiles', 'is_demo', 'id', 'u1'])
          return answer
        },
      }),
    }),
  }),
})

test('isDemoCaller reads the caller’s own profile and fails closed', async () => {
  assert.equal(await isDemoCaller(client({ data: { is_demo: true }, error: null }), 'u1'), true)
  assert.equal(await isDemoCaller(client({ data: { is_demo: false }, error: null }), 'u1'), false)
  assert.equal(await isDemoCaller(client({ data: null, error: null }), 'u1'), false)
  await assert.rejects(isDemoCaller(client({ data: null, error: new Error('down') }), 'u1'), /down/)
})
