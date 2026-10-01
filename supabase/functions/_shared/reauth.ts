// "Did this session sign in recently?" — the re-authentication rule for
// dangerous account actions (deleting the account, adding a passkey,
// connecting or disconnecting Google). Shared by the delete-account edge
// function (enforced server-side) and the app (settings/SecuritySettings and
// AuthProvider, which check before asking Supabase Auth); jwtClaims also keys
// the service worker's offline reads (offlineReads.js). No imports: the unit
// tests and the client load this file too.
//
// Supabase access tokens carry `amr`: how the session was authenticated and
// WHEN ({ method, timestamp } in epoch seconds). A token refresh re-issues the
// JWT (a new `iat`) but keeps `amr`, so its newest timestamp is the last real
// sign-in. Tokens without `amr` fall back to `iat`.

export const REAUTH_WINDOW_SECONDS = 10 * 60

// The error code the edge function answers with, and the app's copy for it.
export const REAUTH_REQUIRED = 'reauth_required'
export const reauthMessage = (what: string) => `For your security, please sign in again to ${what}.`

// The payload of a JWT (or a "Bearer <jwt>" header), unverified — only use it
// for a token the caller has already had checked (the gateway's verify_jwt
// plus auth.getUser, or the client's own session). null when unreadable.
export function jwtClaims(token: string | null | undefined): Record<string, unknown> | null {
  const part = String(token ?? '').replace(/^Bearer\s+/i, '').split('.')[1]
  if (!part) return null
  try {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/')
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
    const json = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
    const claims = JSON.parse(json)
    return claims && typeof claims === 'object' && !Array.isArray(claims) ? claims : null
  } catch {
    return null
  }
}

// When the session last signed in (epoch seconds), or null.
export function signedInAt(claims: Record<string, unknown> | null): number | null {
  if (!claims) return null
  const amr = Array.isArray(claims.amr) ? claims.amr : []
  const times = amr
    .map((a: unknown) => Number((a as { timestamp?: unknown } | null)?.timestamp))
    .filter((t: number) => Number.isFinite(t) && t > 0)
  if (times.length) return Math.max(...times)
  const iat = Number(claims.iat)
  return Number.isFinite(iat) && iat > 0 ? iat : null
}

// True when the token's sign-in is within the window (and not in the future
// beyond a minute of clock skew).
export function isRecentSignIn(
  token: string | null | undefined, nowMs = Date.now(), windowSeconds = REAUTH_WINDOW_SECONDS,
): boolean {
  return isRecentClaims(jwtClaims(token), nowMs, windowSeconds)
}

// The same for a token's claims already read (the native app reads its own
// session's token and asks this through the mobile core).
export function isRecentClaims(
  claims: Record<string, unknown> | null, nowMs = Date.now(), windowSeconds = REAUTH_WINDOW_SECONDS,
): boolean {
  const at = signedInAt(claims)
  if (at == null) return false
  const age = nowMs / 1000 - at
  return age <= windowSeconds && age >= -60
}
