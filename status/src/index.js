// Budgeer status page Worker: the public page, the private admin page and the
// 10-minute checks. Static files (CSS, admin.js, favicon) are Workers static
// assets from ../public and never reach this code.
import { runChecks } from './cron.js'
import { loadPage } from './store.js'
import { renderPublic } from './page.js'
import { handleAdmin } from './admin.js'
import { publicHtml, text } from './http.js'

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url)
    if (pathname === '/admin' || pathname.startsWith('/admin/')) return handleAdmin(request, env)
    if (request.method !== 'GET' && request.method !== 'HEAD') return text('Method not allowed', 405)
    if (pathname !== '/') return text('Not found', 404)
    const now = new Date()
    return publicHtml(renderPublic(await loadPage(env.DB, now.toISOString()), env, now))
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runChecks(env, new Date(event.scheduledTime)))
  },
}
