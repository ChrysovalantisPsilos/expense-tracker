// Apple Push Notification service (APNs) delivery for notify-user: the iOS
// apps' device tokens (apns_devices, 0108) get the same notifications, in the
// same words, as the browsers' web push. Token-based auth: a provider token
// (an ES256 JWT signed with the team's APNs key, function secrets
// APNS_KEY_ID, APNS_TEAM_ID, APNS_KEY_P8) sent over HTTP/2 to the host the
// device token belongs to. Without the secrets, delivery is skipped (as
// email is without RESEND_API_KEY). No imports: the unit tests load this
// file directly (test/apns.test.js).

export type ApnsEnv = 'sandbox' | 'production'

export interface ApnsConfig {
  keyId: string
  teamId: string
  keyP8: string
}

// A build run from Xcode registers with the sandbox; TestFlight and the App
// Store with production. The token remembers which (apns_devices.env).
export const APNS_HOSTS: Record<ApnsEnv, string> = {
  sandbox: 'api.sandbox.push.apple.com',
  production: 'api.push.apple.com',
}

export function apnsHost(env: string): string {
  return env === 'production' ? APNS_HOSTS.production : APNS_HOSTS.sandbox
}

// The topic is the app's bundle id: PROD's project serves "Budgeer"
// (com.budgeer.app), any other project (TEST) "Budgeer Dev".
export const PROD_PROJECT_REF = 'tuxfpylowcxazinqtrzx'
export const APNS_TOPICS = { prod: 'com.budgeer.app', dev: 'com.budgeer.app.dev' } as const

export function apnsTopic(supabaseUrl: string | null | undefined): string {
  let host = ''
  try { host = new URL(String(supabaseUrl ?? '')).hostname } catch { /* not a URL: dev */ }
  return host === `${PROD_PROJECT_REF}.supabase.co` ? APNS_TOPICS.prod : APNS_TOPICS.dev
}

// The three secrets, or null when any is missing or malformed (the key and
// team ids are Apple's 10-character identifiers; the key a PKCS#8 PEM).
export function apnsConfig(get: (name: string) => string | undefined | null): ApnsConfig | null {
  const keyId = String(get('APNS_KEY_ID') ?? '').trim()
  const teamId = String(get('APNS_TEAM_ID') ?? '').trim()
  const keyP8 = String(get('APNS_KEY_P8') ?? '').trim()
  if (!/^[A-Z0-9]{10}$/.test(keyId) || !/^[A-Z0-9]{10}$/.test(teamId)) return null
  if (!keyP8.includes('PRIVATE KEY')) return null
  return { keyId, teamId, keyP8 }
}

// The provider token's header and claims (Apple: alg ES256, kid = key id;
// iss = team id, iat = now in seconds).
export function providerTokenParts(keyId: string, teamId: string, nowSec: number) {
  return {
    header: { alg: 'ES256', kid: keyId },
    claims: { iss: teamId, iat: Math.floor(nowSec) },
  }
}

const b64url = (bytes: Uint8Array): string => {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const b64urlJson = (value: unknown) => b64url(new TextEncoder().encode(JSON.stringify(value)))

function pemToDer(pem: string): Uint8Array {
  const body = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '')
  return Uint8Array.from(atob(body), (c) => c.charCodeAt(0))
}

// Sign the provider token with the .p8 key. WebCrypto's ECDSA signature is
// already JWS's r||s form.
export async function signProviderToken(config: ApnsConfig, nowSec: number, subtle: SubtleCrypto = crypto.subtle): Promise<string> {
  const { header, claims } = providerTokenParts(config.keyId, config.teamId, nowSec)
  const key = await subtle.importKey('pkcs8', pemToDer(config.keyP8), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const input = `${b64urlJson(header)}.${b64urlJson(claims)}`
  const sig = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(input))
  return `${input}.${b64url(new Uint8Array(sig))}`
}

// Apple wants one provider token reused for 20–60 minutes (a new one more
// often than every 20 minutes is refused with TooManyProviderTokenUpdates):
// this keeps one per key for 50 minutes in the warm function instance.
export const PROVIDER_TOKEN_TTL_SEC = 50 * 60

export function providerTokenCache(sign: typeof signProviderToken = signProviderToken) {
  let cached: { keyId: string; teamId: string; jwt: string; at: number } | null = null
  return async (config: ApnsConfig, nowSec: number): Promise<string> => {
    if (cached && cached.keyId === config.keyId && cached.teamId === config.teamId
        && nowSec - cached.at < PROVIDER_TOKEN_TTL_SEC) return cached.jwt
    const jwt = await sign(config, nowSec)
    cached = { keyId: config.keyId, teamId: config.teamId, jwt, at: nowSec }
    return jwt
  }
}

// The notification as APNs carries it: the row's own title and body (the
// same words as web push, never an amount or other encrypted value) and the
// web path the app opens on a tap.
export function apnsPayload(n: { title: string; body?: string | null; url: string; id?: string }): string {
  return JSON.stringify({
    aps: {
      alert: { title: String(n.title ?? '').slice(0, 200), body: String(n.body ?? '').slice(0, 1000) },
      sound: 'default',
    },
    url: n.url,
    ...(n.id ? { notification_id: n.id } : {}),
  })
}

export function apnsRequest(args: { env: string; token: string; topic: string; jwt: string; payload: string }) {
  return {
    url: `https://${apnsHost(args.env)}/3/device/${args.token}`,
    init: {
      method: 'POST',
      headers: {
        authorization: `bearer ${args.jwt}`,
        'apns-topic': args.topic,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'content-type': 'application/json',
      },
      body: args.payload,
    },
  }
}

// A token that will never work again on this project: the app was removed
// (410 Unregistered), or the token is not this host's or this app's.
const DEAD_REASONS = new Set(['BadDeviceToken', 'Unregistered', 'DeviceTokenNotForTopic'])

export function isDeadToken(status: number, reason: string | null | undefined): boolean {
  return status === 410 || (status === 400 && DEAD_REASONS.has(String(reason ?? '')))
}
