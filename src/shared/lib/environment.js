// Which Budgeer site this bundle is running as — the live site (budgeer.com,
// PROD Supabase project) or the test site (dev.budgeer.com, TEST project) —
// and the link to the other one. Pure helpers (unit-tested) plus CURRENT_ENV
// and markEnvironment() for the app.
//
// The Supabase project decides first, because it is what your data touches;
// the host decides when the project is unknown; anything else (localhost, a
// preview deploy) counts as test, so live is never claimed by accident.

export const LIVE = 'live'
export const TEST = 'test'

export const SITES = {
  [LIVE]: { origin: 'https://www.budgeer.com' },
  [TEST]: { origin: 'https://dev.budgeer.com' },
}

const PROJECT_ENV = { tuxfpylowcxazinqtrzx: LIVE, ctvdljzybbujuywppixo: TEST }
const HOST_ENV = { 'budgeer.com': LIVE, 'www.budgeer.com': LIVE, 'dev.budgeer.com': TEST }

// 'https://<ref>.supabase.co' → '<ref>' (null for anything else).
function projectRef(supabaseUrl) {
  const m = /^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/i.exec(String(supabaseUrl || '').trim())
  return m ? m[1].toLowerCase() : null
}

export function detectEnvironment({ host = '', supabaseUrl = '' } = {}) {
  return PROJECT_ENV[projectRef(supabaseUrl)]
    ?? HOST_ENV[String(host).toLowerCase().replace(/:\d+$/, '')]
    ?? TEST
}

export const otherEnvironment = (env) => (env === LIVE ? TEST : LIVE)

// The origin to put in links people share (e.g. a FAQ answer's link): the
// live site's canonical www origin — so the link opens, and its preview
// loads, without the apex's redirect — or the page's own origin elsewhere
// (the test site, localhost), where the link must stay on that site.
export const shareOrigin = (env, origin) => (env === LIVE ? SITES[LIVE].origin : origin)

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Pages keyed by a row id or invite token that won't exist on the other site
// → the list they belong to.
const ID_PAGES = [
  [/^\/transactions\/(?!new\/?$)[^/]+/, '/transactions'],
  [/^\/groups\/[^/]+/, '/groups'],
  [/^\/categories\/[^/]+/, '/settings/categories'],
  [/^\/join\/[^/]+/, '/'],
]

// The same page on the other site: path + query kept, except id pages (sent to
// their list) and query values that are ids (e.g. ?category=<uuid>), which
// would point at nothing there.
export function otherSiteUrl(env, { pathname = '/', search = '' } = {}) {
  const target = SITES[otherEnvironment(env)].origin
  const idPage = ID_PAGES.find(([re]) => re.test(pathname))
  if (idPage) return target + idPage[1]
  const params = new URLSearchParams(search)
  for (const [k, v] of [...params]) if (UUID.test(v)) params.delete(k)
  const query = params.toString()
  return target + (pathname.startsWith('/') ? pathname : '/') + (query ? `?${query}` : '')
}

// Test-site markers: a "DEV · " tab title and a tagged favicon.
const TITLE_PREFIX = 'DEV · '
export const devTitle = (env, title) =>
  env === TEST && !title.startsWith(TITLE_PREFIX) ? TITLE_PREFIX + title : title
export const faviconFor = (env) => (env === TEST ? '/budgeer-mark-dev.svg' : '/budgeer-mark.svg')

// Build-time config (Vercel env vars): PROD sets VITE_SUPABASE_URL, DEV the
// _DEV-suffixed name; whichever is present wins. supabase.js reads it here.
const viteEnv = import.meta.env ?? {}
export const SUPABASE_URL = viteEnv.VITE_SUPABASE_URL || viteEnv.VITE_SUPABASE_URL_DEV
export const CURRENT_ENV = detectEnvironment({
  host: globalThis.location?.host,
  supabaseUrl: SUPABASE_URL,
})
export const isTestSite = CURRENT_ENV === TEST

// Apply the markers to the page once at startup (the title is static).
export function markEnvironment(doc, env = CURRENT_ENV) {
  doc.title = devTitle(env, doc.title)
  const icon = doc.querySelector('link[rel="icon"]')
  if (icon) icon.setAttribute('href', faviconFor(env))
}
