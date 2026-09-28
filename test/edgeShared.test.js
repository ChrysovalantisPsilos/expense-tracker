// Pure helpers shared by the edge functions (supabase/functions/_shared), and
// their parity with the SQL / client copies. Node strips the TypeScript types.
import test from 'node:test'
import assert from 'node:assert/strict'
import { latestSql } from './migrations.js'
import { allowedOrigins, corsHeaders } from '../supabase/functions/_shared/cors.ts'
import { timingSafeEqual } from '../supabase/functions/_shared/cron.ts'
import { eachLimited, isAllowedPushEndpoint } from '../supabase/functions/_shared/push.ts'
import { ZERO_DECIMAL, fmtMinor } from '../supabase/functions/_shared/money.ts'
import { CURRENCIES, minorFactor } from '../src/shared/lib/currency.js'

test('CORS names only the app origins', () => {
  const allowed = allowedOrigins('https://preview.example.dev/', ' https://extra.example.dev ,')
  for (const o of ['https://budgeer.com', 'https://dev.budgeer.com', 'capacitor://localhost', 'https://preview.example.dev', 'https://extra.example.dev']) {
    assert.equal(corsHeaders(o, allowed)['Access-Control-Allow-Origin'], o)
  }
  for (const o of ['https://evil.example', 'https://budgeer.com.evil.example', 'capacitor://evil.example', 'ionic://localhost', null, '']) {
    assert.equal(corsHeaders(o, allowed)['Access-Control-Allow-Origin'], undefined)
  }
  assert.equal(corsHeaders('https://evil.example', allowed).Vary, 'Origin')
})

test('timingSafeEqual compares exactly', async () => {
  assert.equal(await timingSafeEqual('s3cret', 's3cret'), true)
  assert.equal(await timingSafeEqual('s3cret', 's3creT'), false)
  assert.equal(await timingSafeEqual('', 's3cret'), false)
  assert.equal(await timingSafeEqual('s3cret-longer', 's3cret'), false)
})

const PUSH_OK = [
  'https://fcm.googleapis.com/fcm/send/abc',
  'https://updates.push.services.mozilla.com/wpush/v2/abc',
  'https://web.push.apple.com/QGx',
  'https://wns2-par02p.notify.windows.com/w/?token=abc',
]
const PUSH_BAD = [
  'http://fcm.googleapis.com/fcm/send/abc',
  'https://attacker.invalid/p/1',
  'https://fcm.googleapis.com.attacker.invalid/x',
  'https://fcm.googleapis.com:8443/x',
  'https://user:pw@fcm.googleapis.com/x',
  'http://169.254.169.254/latest/meta-data',
  'not a url',
]

test('push endpoint allowlist', () => {
  for (const u of PUSH_OK) assert.equal(isAllowedPushEndpoint(u), true, u)
  for (const u of PUSH_BAD) assert.equal(isAllowedPushEndpoint(u), false, u)
})

test('push allowlist matches save_push_subscription (SQL)', () => {
  const pattern = latestSql('save_push_subscription').match(/!~\* '([^']+)'/)[1]
  const sql = new RegExp(pattern, 'i')
  for (const u of PUSH_OK) assert.equal(sql.test(u), true, u)
  for (const u of PUSH_BAD.filter((u) => !u.includes(':8443') && !u.includes('@'))) {
    assert.equal(sql.test(u), false, u)
  }
})

test('eachLimited caps concurrency and survives failures', async () => {
  let inFlight = 0
  let peak = 0
  const done = []
  await eachLimited([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
    inFlight += 1
    peak = Math.max(peak, inFlight)
    await new Promise((r) => setTimeout(r, 5))
    inFlight -= 1
    if (n === 4) throw new Error('boom')
    done.push(n)
  })
  assert.equal(peak, 3)
  assert.deepEqual(done.sort(), [1, 2, 3, 5, 6, 7])
})

test('zero-decimal currencies agree across client, edge and SQL', () => {
  const sql = latestSql('minor_factor').match(/in \(([^)]+)\)/)[1]
  const sqlSet = new Set(sql.split(',').map((s) => s.trim().replace(/'/g, '')))
  assert.deepEqual([...sqlSet].sort(), [...ZERO_DECIMAL].sort())
  for (const c of [...CURRENCIES, 'VND', 'CLP']) {
    assert.equal(minorFactor(c), ZERO_DECIMAL.has(c) ? 1 : 100, c)
  }
  // Edge formatting keeps HUF/IDR decimals and drops them for ISK/JPY.
  assert.equal(fmtMinor(123456, 'HUF'), '1234.56 HUF')
  assert.equal(fmtMinor(123456, 'IDR'), '1234.56 IDR')
  assert.equal(fmtMinor(1800, 'ISK'), '1800 ISK')
  assert.equal(fmtMinor(1800, 'JPY'), '1800 JPY')
})
