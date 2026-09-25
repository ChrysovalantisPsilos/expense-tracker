// Cloudflare Access, checked again inside the Worker (defence in depth).
//
// Access sits in front of /admin and adds a signed JWT in the
// Cf-Access-Jwt-Assertion header. We verify it ourselves: RS256 against the
// team's published keys (cached), `aud` must be our application's audience
// tag, `iss` our team domain, and it must not have expired. Without
// ACCESS_TEAM_DOMAIN and ACCESS_AUD configured nothing verifies, so /admin
// fails closed.
const CERTS_TTL_MS = 60 * 60 * 1000
const REFETCH_MS = 5 * 60 * 1000
const SKEW_S = 60
const certCache = new Map()   // teamDomain → { at, keys: Map(kid → CryptoKey) }

const b64urlBytes = (s) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4))
  return Uint8Array.from(b, (c) => c.charCodeAt(0))
}
const b64urlJson = (s) => JSON.parse(new TextDecoder().decode(b64urlBytes(s)))

// The claim checks, separated so they can be tested on their own.
export function checkClaims(claims, { aud, iss, nowS }) {
  if (!claims || typeof claims !== 'object') return false
  const auds = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
  if (!aud || !auds.includes(aud)) return false
  if (claims.iss !== iss) return false
  if (typeof claims.exp !== 'number' || claims.exp <= nowS) return false
  if (typeof claims.nbf === 'number' && claims.nbf > nowS + SKEW_S) return false
  return true
}

async function teamKeys(teamDomain, fetchImpl, nowMs) {
  const hit = certCache.get(teamDomain)
  if (hit && nowMs - hit.at < CERTS_TTL_MS) return hit.keys
  const res = await fetchImpl(`https://${teamDomain}/cdn-cgi/access/certs`)
  if (!res.ok) throw new Error(`certs ${res.status}`)
  const { keys = [] } = await res.json()
  const map = new Map()
  for (const jwk of keys) {
    if (jwk.kty !== 'RSA' || !jwk.kid) continue
    map.set(jwk.kid, await crypto.subtle.importKey(
      'jwk', { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']))
  }
  certCache.set(teamDomain, { at: nowMs, keys: map })
  return map
}

// Returns the verified claims, or null.
export async function verifyAccessJwt(token, { teamDomain, aud, fetchImpl = fetch, nowMs = Date.now() }) {
  if (!teamDomain || !aud || typeof token !== 'string') return null
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(teamDomain)) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const header = b64urlJson(parts[0])
    if (header.alg !== 'RS256' || !header.kid) return null
    let key = (await teamKeys(teamDomain, fetchImpl, nowMs)).get(header.kid)
    // Keys rotate: an unknown kid refetches, at most every few minutes (so
    // forged tokens can't make every request fetch the certs).
    if (!key && nowMs - certCache.get(teamDomain).at > REFETCH_MS) {
      certCache.delete(teamDomain)
      key = (await teamKeys(teamDomain, fetchImpl, nowMs)).get(header.kid)
    }
    if (!key) return null
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlBytes(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`))
    if (!ok) return null
    const claims = b64urlJson(parts[1])
    return checkClaims(claims, { aud, iss: `https://${teamDomain}`, nowS: Math.floor(nowMs / 1000) }) ? claims : null
  } catch {
    return null
  }
}

// The verifier the admin routes use, bound to the Worker's settings.
export const accessVerifier = (env, fetchImpl = fetch) => (request) =>
  verifyAccessJwt(request.headers.get('Cf-Access-Jwt-Assertion'),
    { teamDomain: env.ACCESS_TEAM_DOMAIN, aud: env.ACCESS_AUD, fetchImpl })
