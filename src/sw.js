// Budgeer service worker (vite-plugin-pwa injectManifest mode).
//
// Replicates what generateSW gave us before — precached app shell, SPA
// navigation fallback, NetworkFirst for Supabase reads — and adds what it
// couldn't: web-push handlers for payment reminders.

import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import { CacheFirst, NetworkFirst } from 'workbox-strategies'
import { CacheExpiration, ExpirationPlugin } from 'workbox-expiration'
import { offlineReadRpc, offlineReadKey, requestUser } from './shared/lib/offlineReads.js'
import {
  REST_CACHE, RPC_CACHE, REST_CACHE_LIMITS, RPC_CACHE_LIMITS, NETWORK_TIMEOUT_SECONDS, isLegacyRpcKey,
  STATEMENT_FONT_CACHE, STATEMENT_FONT_CACHE_LIMITS,
} from './shared/lib/userDataCaches.js'
import { STATEMENT_FONT_DIR } from '../supabase/functions/_shared/brandFonts.ts'

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// SPA navigation fallback so the installed PWA opens on any route. Same
// exclusions as vercel.json's rewrite: /assets/ and any path with a dot in it
// (robots.txt, sitemap.xml, images…) go to the network, not the app shell.
// Workbox matches pathname + search, so the dot test stops at the "?".
// /auth/confirm (the auth emails' links) always loads the current page from
// the network: a shell cached before that route existed would show a 404.
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), {
  denylist: [/^\/assets\//, /^[^?]*\./, /^\/auth\/confirm(?:[/?]|$)/],
}))

// Supabase REST reads: serve cached data while offline (or when the network
// hangs past the timeout), refresh when online. Both caches are wiped on any
// sign-out (AuthProvider → clearUserDataCaches).
registerRoute(
  ({ url }) => url.pathname.startsWith('/rest/v1'),
  new NetworkFirst({
    cacheName: REST_CACHE,
    networkTimeoutSeconds: NETWORK_TIMEOUT_SECONDS,
    plugins: [new ExpirationPlugin(REST_CACHE_LIMITS)],
  }),
)

// Decrypting ledger reads are POST RPCs, which the route above (GET-only) can't
// cache. Network first; on success file the response under a per-user,
// per-arguments GET key in their own bounded cache (a day, the newest N
// entries); offline, serve that copy while it's fresh. Only allowlisted read
// RPCs, never writes.
const rpcExpiration = new CacheExpiration(RPC_CACHE, RPC_CACHE_LIMITS)
registerRoute(
  ({ url, request }) => !!offlineReadRpc(request.method, url.pathname),
  async ({ url, request, event }) => {
    const body = await request.clone().text()
    const who = requestUser(request.headers.get('authorization'))
    const key = offlineReadKey(url.origin, offlineReadRpc(request.method, url.pathname), body, who)
    const cache = await caches.open(RPC_CACHE)
    try {
      const res = await fetch(request)
      if (res.ok) {
        await cache.put(key, res.clone())
        await rpcExpiration.updateTimestamp(key)
        event?.waitUntil?.(rpcExpiration.expireEntries())
      }
      return res
    } catch (err) {
      const hit = await cache.match(key)
      if (hit && !(await rpcExpiration.isURLExpired(key))) return hit
      throw err
    }
  },
  'POST',
)

// The statement PDFs' fonts (made on the device, src/shared/lib/pdf.js): kept
// after the first export, so a later one works offline. The path carries each
// font's package version, so a new pin is a new entry; the old ones age out.
registerRoute(
  ({ url }) => url.origin === self.location.origin && url.pathname.startsWith(`/${STATEMENT_FONT_DIR}/`),
  new CacheFirst({
    cacheName: STATEMENT_FONT_CACHE,
    plugins: [new ExpirationPlugin(STATEMENT_FONT_CACHE_LIMITS)],
  }),
)

// RPC reads cached by earlier versions sit in the REST cache with no expiry.
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(REST_CACHE)
    for (const req of await cache.keys()) {
      if (isLegacyRpcKey(req.url)) await cache.delete(req)
    }
  })())
})

// Updates: AutoUpdate sends SKIP_WAITING once it's safe to reload.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

// ---------------------------------------------------------------------------
// Web push (payment reminders). Payload: { title, body, url }.
// ---------------------------------------------------------------------------
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data?.json() ?? {} } catch { /* non-JSON push */ }
  event.waitUntil(self.registration.showNotification(data.title ?? 'Budgeer', {
    body: data.body ?? '',
    icon: '/pwa-192.png',
    // Android draws the badge from its alpha channel only: a white silhouette.
    badge: '/pwa-badge.png',
    data: { url: data.url ?? '/' },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const win of wins) {
        if ('focus' in win) { win.navigate(url); return win.focus() }
      }
      return self.clients.openWindow(url)
    }),
  )
})
