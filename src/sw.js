// Budge service worker (vite-plugin-pwa injectManifest mode).
//
// Replicates what generateSW gave us before — precached app shell, SPA
// navigation fallback, NetworkFirst for Supabase reads — and adds what it
// couldn't: web-push handlers for payment reminders.

import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import { NetworkFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// SPA navigation fallback so the installed PWA opens on any route.
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))

// Supabase REST reads: serve cached data while offline, refresh when online.
registerRoute(
  ({ url }) => url.pathname.startsWith('/rest/v1'),
  new NetworkFirst({
    cacheName: 'supabase-rest',
    plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 })],
  }),
)

// Prompt-mode updates: ReloadPrompt's "Update" button sends SKIP_WAITING.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

// ---------------------------------------------------------------------------
// Web push (payment reminders). Payload: { title, body, url }.
// ---------------------------------------------------------------------------
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data?.json() ?? {} } catch { /* non-JSON push */ }
  event.waitUntil(self.registration.showNotification(data.title ?? 'Budge', {
    body: data.body ?? '',
    icon: '/pwa-icon.svg',
    badge: '/pwa-icon.svg',
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
