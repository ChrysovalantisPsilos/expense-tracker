// Status page: the Cloudflare Access JWT check (claims, signature, config).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkClaims, verifyAccessJwt, accessVerifier } from '../status/src/access.js'
import { signingKey, signJwt } from './statusJwt.js'

const TEAM = 'budgeer-test.cloudflareaccess.com'
const AUD = 'aud-tag-123'
const nowS = 1790000000

test('checkClaims: aud, iss, exp and nbf', () => {
  const base = { aud: [AUD], iss: `https://${TEAM}`, exp: nowS + 60, email: 'owner@example.com' }
  const opts = { aud: AUD, iss: `https://${TEAM}`, nowS }
  assert.equal(checkClaims(base, opts), true)
  assert.equal(checkClaims({ ...base, aud: AUD }, opts), true)
  assert.equal(checkClaims({ ...base, aud: ['someone-else'] }, opts), false)
  assert.equal(checkClaims(base, { ...opts, aud: '' }), false)
  assert.equal(checkClaims({ ...base, iss: 'https://evil.cloudflareaccess.com' }, opts), false)
  assert.equal(checkClaims({ ...base, exp: nowS }, opts), false)
  assert.equal(checkClaims({ ...base, exp: undefined }, opts), false)
  assert.equal(checkClaims({ ...base, nbf: nowS + 3600 }, opts), false)
  assert.equal(checkClaims(null, opts), false)
})

test('verifyAccessJwt: RS256 against the team certs', async () => {
  const k = await signingKey('kid-1')
  let fetches = 0
  const fetchImpl = async (url) => {
    fetches += 1
    assert.equal(url, `https://${TEAM}/cdn-cgi/access/certs`)
    return new Response(JSON.stringify({ keys: [k.jwk] }), { headers: { 'content-type': 'application/json' } })
  }
  const claims = { aud: [AUD], iss: `https://${TEAM}`, exp: nowS + 300, email: 'owner@example.com' }
  const opts = { teamDomain: TEAM, aud: AUD, fetchImpl, nowMs: nowS * 1000 }

  const ok = await verifyAccessJwt(await signJwt(k, claims), opts)
  assert.equal(ok?.email, 'owner@example.com')
  await verifyAccessJwt(await signJwt(k, claims), opts)
  assert.equal(fetches, 1, 'certs are cached')

  assert.equal(await verifyAccessJwt(await signJwt(k, { ...claims, aud: ['other'] }), opts), null)
  assert.equal(await verifyAccessJwt(await signJwt(k, { ...claims, exp: nowS - 1 }), opts), null)
  const other = await signingKey('kid-1')   // same kid, different key: bad signature
  assert.equal(await verifyAccessJwt(await signJwt(other, claims), opts), null)
  const tampered = (await signJwt(k, claims)).split('.')
  tampered[1] = Buffer.from(JSON.stringify({ ...claims, email: 'attacker@example.com' })).toString('base64url')
  assert.equal(await verifyAccessJwt(tampered.join('.'), opts), null)
  assert.equal(await verifyAccessJwt(await signJwt(k, claims, { alg: 'HS256' }), opts), null)
  assert.equal(await verifyAccessJwt('not.a.jwt', opts), null)
  assert.equal(await verifyAccessJwt(null, opts), null)
  assert.equal(await verifyAccessJwt(await signJwt(k, claims), { ...opts, teamDomain: 'evil.com/x?' }), null)
})

test('accessVerifier fails closed without ACCESS_TEAM_DOMAIN / ACCESS_AUD', async () => {
  const k = await signingKey('kid-2')
  const token = await signJwt(k, { aud: [AUD], iss: `https://${TEAM}`, exp: Math.floor(Date.now() / 1000) + 60 })
  const fetchImpl = async () => { throw new Error('must not fetch') }
  const req = new Request('https://status.example/admin', { headers: { 'Cf-Access-Jwt-Assertion': token } })
  assert.equal(await accessVerifier({ ACCESS_TEAM_DOMAIN: '', ACCESS_AUD: AUD }, fetchImpl)(req), null)
  assert.equal(await accessVerifier({ ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: '' }, fetchImpl)(req), null)
  assert.equal(await accessVerifier({}, fetchImpl)(new Request('https://status.example/admin')), null)
})
