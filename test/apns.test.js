// The pure parts of the iOS push delivery (supabase/functions/_shared/apns.ts):
// the host per token environment, the topic per project, the secrets, the
// provider token's shape and signature, its reuse, the payload and which
// answers remove a token.
import test from 'node:test'
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import {
  APNS_TOPICS, PROVIDER_TOKEN_TTL_SEC, apnsConfig, apnsHost, apnsPayload, apnsRequest, apnsTopic,
  isDeadToken, providerTokenCache, providerTokenParts, signProviderToken,
} from '../supabase/functions/_shared/apns.ts'

const subtle = webcrypto.subtle

test('apnsHost: production tokens to production, anything else to the sandbox', () => {
  assert.equal(apnsHost('production'), 'api.push.apple.com')
  assert.equal(apnsHost('sandbox'), 'api.sandbox.push.apple.com')
  assert.equal(apnsHost('staging'), 'api.sandbox.push.apple.com')
})

test('apnsTopic: PROD serves Budgeer, every other project Budgeer Dev', () => {
  assert.equal(apnsTopic('https://tuxfpylowcxazinqtrzx.supabase.co'), APNS_TOPICS.prod)
  assert.equal(APNS_TOPICS.prod, 'com.budgeer.app')
  assert.equal(apnsTopic('https://ctvdljzybbujuywppixo.supabase.co'), 'com.budgeer.app.dev')
  assert.equal(apnsTopic('https://tuxfpylowcxazinqtrzx.supabase.co.evil.example'), 'com.budgeer.app.dev')
  assert.equal(apnsTopic(undefined), 'com.budgeer.app.dev')
})

test('apnsConfig: all three secrets, well formed, or nothing', () => {
  const env = {
    APNS_KEY_ID: 'ABC123DEFG',
    APNS_TEAM_ID: 'TEAM123456',
    APNS_KEY_P8: '-----BEGIN PRIVATE KEY-----\nAA\n-----END PRIVATE KEY-----',
  }
  assert.deepEqual(apnsConfig((k) => env[k]), { keyId: 'ABC123DEFG', teamId: 'TEAM123456', keyP8: env.APNS_KEY_P8 })
  for (const missing of Object.keys(env)) {
    assert.equal(apnsConfig((k) => (k === missing ? undefined : env[k])), null)
  }
  assert.equal(apnsConfig((k) => (k === 'APNS_KEY_ID' ? 'short' : env[k])), null)
  assert.equal(apnsConfig((k) => (k === 'APNS_KEY_P8' ? 'not a key' : env[k])), null)
})

test('providerTokenParts: ES256 with the key id, the team as issuer, whole seconds', () => {
  assert.deepEqual(providerTokenParts('ABC123DEFG', 'TEAM123456', 1_790_000_000.7), {
    header: { alg: 'ES256', kid: 'ABC123DEFG' },
    claims: { iss: 'TEAM123456', iat: 1_790_000_000 },
  })
})

const b64urlDecode = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')

test('signProviderToken: a JWT the key\'s public half verifies', async () => {
  const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const der = Buffer.from(await subtle.exportKey('pkcs8', pair.privateKey)).toString('base64')
  const pem = `-----BEGIN PRIVATE KEY-----\n${der.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----`
  const jwt = await signProviderToken({ keyId: 'ABC123DEFG', teamId: 'TEAM123456', keyP8: pem }, 1_790_000_000, subtle)
  const [h, c, sig] = jwt.split('.')
  assert.deepEqual(JSON.parse(b64urlDecode(h)), { alg: 'ES256', kid: 'ABC123DEFG' })
  assert.deepEqual(JSON.parse(b64urlDecode(c)), { iss: 'TEAM123456', iat: 1_790_000_000 })
  assert.equal(b64urlDecode(sig).length, 64)
  const ok = await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey, b64urlDecode(sig),
    new TextEncoder().encode(`${h}.${c}`))
  assert.equal(ok, true)
})

test('providerTokenCache: one token reused for 50 minutes, a new one after or for another key', async () => {
  let signed = 0
  const get = providerTokenCache(async (cfg, now) => `jwt-${cfg.keyId}-${now}-${++signed}`)
  const cfg = { keyId: 'ABC123DEFG', teamId: 'TEAM123456', keyP8: 'x' }
  const first = await get(cfg, 1000)
  assert.equal(await get(cfg, 1000 + PROVIDER_TOKEN_TTL_SEC - 1), first)
  assert.notEqual(await get(cfg, 1000 + PROVIDER_TOKEN_TTL_SEC), first)
  await get({ ...cfg, keyId: 'ZZZ123DEFG' }, 1000 + PROVIDER_TOKEN_TTL_SEC)
  assert.equal(signed, 3)
})

test('apnsPayload: the notification\'s own words and the path to open', () => {
  assert.deepEqual(JSON.parse(apnsPayload({ title: 'Anna added an expense', body: 'Dinner in Trip', url: '/groups/g1', id: 'n1' })), {
    aps: { alert: { title: 'Anna added an expense', body: 'Dinner in Trip' }, sound: 'default' },
    url: '/groups/g1',
    notification_id: 'n1',
  })
  const bare = JSON.parse(apnsPayload({ title: 'Hi', body: null, url: '/' }))
  assert.equal(bare.aps.alert.body, '')
  assert.equal('notification_id' in bare, false)
  assert.ok(apnsPayload({ title: 'x'.repeat(5000), body: 'y'.repeat(5000), url: '/' }).length < 1400)
})

test('apnsRequest: the token\'s host, the topic, an alert at once', () => {
  const token = 'ab'.repeat(32)
  const { url, init } = apnsRequest({ env: 'production', token, topic: 'com.budgeer.app', jwt: 'J', payload: '{}' })
  assert.equal(url, `https://api.push.apple.com/3/device/${token}`)
  assert.equal(init.method, 'POST')
  assert.equal(init.headers.authorization, 'bearer J')
  assert.equal(init.headers['apns-topic'], 'com.budgeer.app')
  assert.equal(init.headers['apns-push-type'], 'alert')
})

test('isDeadToken: removed apps and foreign tokens go, other failures stay', () => {
  assert.equal(isDeadToken(410, 'Unregistered'), true)
  assert.equal(isDeadToken(400, 'BadDeviceToken'), true)
  assert.equal(isDeadToken(400, 'DeviceTokenNotForTopic'), true)
  assert.equal(isDeadToken(400, 'PayloadTooLarge'), false)
  assert.equal(isDeadToken(403, 'InvalidProviderToken'), false)
  assert.equal(isDeadToken(429, 'TooManyRequests'), false)
  assert.equal(isDeadToken(500, null), false)
})
