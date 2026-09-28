// Links that open the iOS app, and where each one goes inside it. Pure (the
// app's glue is src/app/NativeBridge.jsx); every URL here is untrusted input
// from another app or a web page, so anything not recognised is dropped.
//
// Two ways in:
//  - The app's own scheme, com.budgeer.app://…: Google sign-in comes back on
//    com.budgeer.app://auth/callback?code=… (the system browser can't return
//    to capacitor://localhost), and the scheme can also open an app link
//    (com.budgeer.app://join/<token>) for testing before universal links.
//  - Universal links, https://<site>/…: the paths in APP_LINKS, as listed in
//    public/.well-known/apple-app-site-association (test/deepLinks.test.js
//    keeps the two in step). Emails' confirm/reset links and invite links.
import { safeReturnPath } from './returnPath.js'
import { CURRENT_ENV, otherEnvironment, siteHosts } from './environment.js'

export const APP_SCHEME = 'com.budgeer.app'
const CALLBACK = '/auth/callback'
const NEXT_PARAM = 'next'

// The pages a link may open in the app ("*" is one path segment: an invite
// token), each with the query parameters it keeps; everything else in the
// query and the fragment is dropped.
export const APP_LINKS = {
  '/join/*': [],
  '/auth/confirm': ['token_hash', 'type'],
}

const SEGMENT = '[A-Za-z0-9_-]{1,128}'
const LINK_RULES = Object.entries(APP_LINKS).map(([pattern, keep]) => ({
  re: new RegExp(`^${pattern.split('*').map((p) => p.replace(/[.?+^$()[\]{}|\\/]/g, '\\$&')).join(SEGMENT)}/?$`),
  keep,
}))

// An Auth code (a UUID today) or similar opaque token.
const CODE = /^[A-Za-z0-9_-]{8,512}$/

// Where Google sign-in returns in the app. `next` (an app path, e.g. Settings
// → Security after connecting Google) rides along when it is safe. Supabase
// Auth's Redirect URLs must allow com.budgeer.app://** (docs/IOS.md).
export function nativeAuthRedirect(next) {
  const back = next ? safeReturnPath(next) : null
  return `${APP_SCHEME}://auth/callback${back ? `?${NEXT_PARAM}=${encodeURIComponent(back)}` : ''}`
}

// `pathname` + `params` → the in-app path for an app link, or null.
function appLinkPath(pathname, params) {
  const rule = LINK_RULES.find(({ re }) => re.test(pathname))
  if (!rule) return null
  const kept = new URLSearchParams()
  for (const key of rule.keep) {
    const value = params.get(key)
    if (value !== null) kept.set(key, value)
  }
  const query = kept.toString()
  return `${pathname.replace(/\/$/, '')}${query ? `?${query}` : ''}`
}

// The OAuth error a redirect came back with, added to `path`'s query so the
// page that asked (Settings → Security) can say what went wrong.
function withError(path, params) {
  const url = new URL(path, 'https://budgeer.invalid')
  for (const key of ['error', 'error_code', 'error_description']) {
    const value = params.get(key)
    if (value) url.searchParams.set(key, value.slice(0, 300))
  }
  return safeReturnPath(`${url.pathname}${url.search}`)
}

// A URL the app was opened with → what to do:
//   { kind: 'signin', code, path } finish Google sign-in (exchange `code`,
//     when there is one), then open `path` (null: stay; the app's sign-in
//     routing takes over)
//   { kind: 'route', path }        open this page in the app
//   { kind: 'browser', url }       a link for the other site (a TEST build
//     opened by a budgeer.com invite): hand it to the browser
//   null                           not ours, malformed or unsafe: ignore
export function deepLinkTarget(raw, env = CURRENT_ENV) {
  if (typeof raw !== 'string' || raw.length > 4096) return null
  let url
  try { url = new URL(raw) } catch { return null }
  if (url.username || url.password || url.port) return null

  if (url.protocol === `${APP_SCHEME}:`) {
    // com.budgeer.app://auth/callback parses as host "auth", path "/callback".
    const path = `/${url.host}${url.pathname}`
    if (path === CALLBACK) {
      const params = url.searchParams
      const next = safeReturnPath(params.get(NEXT_PARAM))
      if (params.get('error') || params.get('error_code')) {
        return { kind: 'signin', code: null, path: next && withError(next, params) }
      }
      const code = params.get('code')
      return code && CODE.test(code) ? { kind: 'signin', code, path: next } : null
    }
    const link = appLinkPath(path, url.searchParams)
    return link ? { kind: 'route', path: link } : null
  }

  if (url.protocol !== 'https:') return null
  const host = url.hostname.toLowerCase()
  const link = appLinkPath(url.pathname, url.searchParams)
  if (!link) return null
  if (siteHosts(env).includes(host)) return { kind: 'route', path: link }
  if (siteHosts(otherEnvironment(env)).includes(host)) return { kind: 'browser', url: url.href }
  return null
}
