// Response helpers with the security headers every page carries.
//
// CSP: no inline script or style at all. The public page runs no script; the
// admin page loads only /admin.js from this origin. Fonts come from Google
// Fonts, everything else from here.
const csp = (script) => [
  "default-src 'none'",
  "style-src 'self' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  "img-src 'self' data:",
  `script-src ${script ? "'self'" : "'none'"}`,
  `connect-src ${script ? "'self'" : "'none'"}`,
  "form-action 'self'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join('; ')

// same-origin, not no-referrer: with no-referrer browsers send `Origin: null`
// on our own form posts, which the admin's same-origin check would refuse.
const base = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'same-origin',
  'x-frame-options': 'DENY',
}

// Public page: cached briefly at the edge and in the browser.
export const publicHtml = (body, status = 200) => new Response(String(body), {
  status,
  headers: { ...base, 'content-type': 'text/html; charset=utf-8', 'content-security-policy': csp(false), 'cache-control': 'public, max-age=60' },
})

// Admin pages: never cached, never indexed.
export const adminHtml = (body, status = 200) => new Response(String(body), {
  status,
  headers: {
    ...base, 'content-type': 'text/html; charset=utf-8', 'content-security-policy': csp(true),
    'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow',
  },
})

export const text = (body, status) => new Response(body, {
  status, headers: { ...base, 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
})

export const redirect = (location) => new Response(null, {
  status: 303, headers: { ...base, location, 'cache-control': 'no-store' },
})
