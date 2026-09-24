// Budgeer service worker (vite-plugin-pwa injectManifest mode).
//
// Replicates what generateSW gave us before — precached app shell, SPA
// navigation fallback, NetworkFirst for Supabase reads — and adds what it
// couldn't: web-push handlers for payment reminders.

import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import { NetworkFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { offlineReadRpc, offlineReadKey, requestUser } from './shared/lib/offlineReads.js'

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// SPA navigation fallback so the installed PWA opens on any route. Same
// exclusions as vercel.json's rewrite: /assets/ and any path with a dot in it
// (robots.txt, sitemap.xml, images…) go to the network, not the app shell.
// Workbox matches pathname + search, so the dot test stops at the "?".
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), {
  denylist: [/^\/assets\//, /^[^?]*\./],
}))

// Supabase REST reads: serve cached data while offline, refresh when online.
registerRoute(
  ({ url }) => url.pathname.startsWith('/rest/v1'),
  new NetworkFirst({
    cacheName: 'supabase-rest',
    plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 })],
  }),
)

// Decrypting ledger reads are POST RPCs, which the route above (GET-only) can't
// cache. Network first; on success file the response under a per-user,
// per-arguments GET key in the same cache (so sign-out's cache wipe clears it);
// offline, serve that copy. Only allowlisted read RPCs, never writes.
registerRoute(
  ({ url, request }) => !!offlineReadRpc(request.method, url.pathname),
  async ({ url, request }) => {
    const body = await request.clone().text()
    const who = requestUser(request.headers.get('authorization'))
    const key = offlineReadKey(url.origin, offlineReadRpc(request.method, url.pathname), body, who)
    const cache = await caches.open('supabase-rest')
    try {
      const res = await fetch(request)
      if (res.ok) await cache.put(key, res.clone())
      return res
    } catch (err) {
      const hit = await cache.match(key)
      if (hit) return hit
      throw err
    }
  },
  'POST',
)

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
