// Where to land after signing in. A signed-out visit to an app page sends the
// visitor to /login?next=<that page>; after sign-in they go back there. The
// value arrives from the address bar, so it is untrusted: this is the
// open-redirect guard. Only a same-origin, app-relative path is accepted.
import { STORAGE_KEYS } from './keys.js'

const KEY = STORAGE_KEYS.returnPath

// The query parameter Login reads.
export const NEXT_PARAM = 'next'

// A stashed return path older than this is ignored (an abandoned Google or
// sign-up attempt shouldn't steer a later, unrelated sign-in).
export const RETURN_TTL_MS = 60 * 60 * 1000

const MAX_LENGTH = 2048
// Any control character, whitespace or backslash. Browsers strip tabs and
// newlines and read `\` as `/`, so "/\evil.com" or "/\t/evil.com" would
// become the protocol-relative "//evil.com".
const hasUnsafeChar = (s) => /[\s\\]/.test(s)
  || [...s].some((c) => c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f)
// Pages that only make sense signed out: returning to them would loop.
const AUTH_PAGES = ['/login', '/verify-email', '/auth/confirm', '/forgot-password', '/reset-password']
const BASE = 'https://budgeer.invalid'

// `raw` → a normalised app path ("/groups/abc?tab=1#x"), or null when it is
// missing, not a string, absolute (`https://…`, `javascript:`), protocol-
// relative (`//host`), contains a backslash / control character, resolves
// off-origin, or points back at a sign-in page.
export function safeReturnPath(raw) {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_LENGTH) return null
  if (raw[0] !== '/' || raw[1] === '/' || hasUnsafeChar(raw)) return null
  let url
  try { url = new URL(raw, BASE) } catch { return null }
  if (url.origin !== BASE) return null
  // Dot segments can fold "/..//evil.com" into "//evil.com".
  if (!url.pathname.startsWith('/') || url.pathname.startsWith('//')) return null
  const path = url.pathname.replace(/\/+$/, '') || '/'
  if (AUTH_PAGES.includes(path.toLowerCase())) return null
  return `${url.pathname}${url.search}${url.hash}`
}

// The login address that brings the visitor back to `location` (a router
// location: pathname, search, hash) once they have signed in.
export function loginPathFor({ pathname, search = '', hash = '' }) {
  const back = safeReturnPath(`${pathname}${search}${hash}`)
  return back ? `/login?${NEXT_PARAM}=${encodeURIComponent(back)}` : '/login'
}

// ---- Stash for sign-ins that leave the page -------------------------------
// Google OAuth, the email-confirmation link and a password reset all come back
// to the site root rather than to /login?next=…, so Login stores the return
// path first and the signed-in app takes it on arrival. localStorage (not
// sessionStorage) because the confirmation link usually opens in a new tab.
// `storage` / `now` are injectable for tests.

// Store `path` (if safe) with a timestamp, or clear the stash when there is
// nothing safe to store.
export function rememberReturnPath(path, storage = globalThis.localStorage, now = Date.now()) {
  const safe = safeReturnPath(path)
  try {
    if (safe) storage.setItem(KEY, JSON.stringify({ path: safe, at: now }))
    else storage.removeItem(KEY)
  } catch { /* storage unavailable: the visitor lands on Home instead */ }
}

// Read and clear the stash: the stored path if it is fresh and still safe.
export function takeReturnPath(storage = globalThis.localStorage, now = Date.now()) {
  let raw = null
  try {
    raw = storage.getItem(KEY)
    if (raw !== null) storage.removeItem(KEY)
  } catch { return null }
  if (!raw) return null
  try {
    const { path, at } = JSON.parse(raw)
    if (typeof at !== 'number' || now - at < 0 || now - at > RETURN_TTL_MS) return null
    return safeReturnPath(path)
  } catch { return null }
}
