// The App Store Connect API: the ES256 token and a small JSON:API client.
// No packages: node:crypto signs the token, the global fetch sends the calls.
//
// The token (Apple, "Generating Tokens for API Requests"): header
// { alg: ES256, kid: <key id>, typ: JWT }, claims { iss: <issuer id>,
// iat, exp (at most 20 minutes later), aud: "appstoreconnect-v1" }, signed
// with the team key's P-256 private key, the signature as raw r‖s (64 bytes).
// Nothing here logs a request body, a header or the key.
import { createPrivateKey, sign } from 'node:crypto'

export const API_ROOT = 'https://api.appstoreconnect.apple.com'
export const AUDIENCE = 'appstoreconnect-v1'
// Apple refuses tokens that live longer than 20 minutes.
export const TOKEN_LIFETIME_S = 15 * 60

const base64url = (input) => Buffer.from(input).toString('base64url')

export function tokenParts({ keyId, issuerId, now = Date.now() }) {
  const iat = Math.floor(now / 1000)
  return {
    header: { alg: 'ES256', kid: keyId, typ: 'JWT' },
    claims: { iss: issuerId, iat, exp: iat + TOKEN_LIFETIME_S, aud: AUDIENCE },
  }
}

// A key pasted into a secret can lose its line breaks or gain \r; rebuild the
// PEM so createPrivateKey reads it either way.
export function normalisePem(pem) {
  const body = String(pem)
    .replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '')
    .replace(/\\n/g, '')
    .replace(/\s+/g, '')
  if (!body) throw new Error('The API key (ASC_KEY_P8) is empty.')
  const lines = body.match(/.{1,64}/g).join('\n')
  return `-----BEGIN PRIVATE KEY-----\n${lines}\n-----END PRIVATE KEY-----\n`
}

export function makeToken({ keyId, issuerId, privateKey, now = Date.now() }) {
  const { header, claims } = tokenParts({ keyId, issuerId, now })
  const input = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`
  const key = createPrivateKey(normalisePem(privateKey))
  const signature = sign('sha256', Buffer.from(input), { key, dsaEncoding: 'ieee-p1363' })
  return `${input}.${base64url(signature)}`
}

// An API error's own words (JSON:API `errors`), without the request.
export function errorText(status, body) {
  const errors = Array.isArray(body?.errors) ? body.errors : []
  const parts = errors.map((e) => [e.code, e.title, e.detail].filter(Boolean).join(': '))
  return `${status}${parts.length ? ` ${parts.join(' | ')}` : ''}`
}

export class AscError extends Error {
  constructor(method, path, status, body) {
    super(`${method} ${path} → ${errorText(status, body)}`)
    this.status = status
    this.body = body
  }
}

// A client over one key. `fetchImpl` is swappable for tests.
export function createClient({ keyId, issuerId, privateKey, fetchImpl = globalThis.fetch }) {
  let token = null
  let tokenAt = 0
  const bearer = () => {
    // A fresh token every ten minutes keeps a long run inside the lifetime.
    if (!token || Date.now() - tokenAt > 10 * 60 * 1000) {
      token = makeToken({ keyId, issuerId, privateKey })
      tokenAt = Date.now()
    }
    return token
  }

  async function call(method, path, body) {
    const url = path.startsWith('http') ? path : `${API_ROOT}${path}`
    const res = await fetchImpl(url, {
      method,
      headers: {
        Authorization: `Bearer ${bearer()}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const text = res.status === 204 ? '' : await res.text()
    let json = null
    try { json = text ? JSON.parse(text) : null } catch { json = null }
    const shown = path.startsWith('http') ? new URL(path).pathname : path.split('?')[0]
    if (!res.ok) throw new AscError(method, shown, res.status, json)
    return json
  }

  return {
    get: (path) => call('GET', path),
    post: (path, body) => call('POST', path, body),
    patch: (path, body) => call('PATCH', path, body),
    delete: (path, body) => call('DELETE', path, body),
    // Every page of a list (follows links.next).
    async all(path) {
      const out = []
      let next = path
      while (next) {
        const page = await call('GET', next)
        out.push(...(page?.data ?? []))
        next = page?.links?.next ?? null
      }
      return out
    },
  }
}
