// CORS for the browser-called edge functions. Instead of `*`, the response
// names the caller's Origin only when it is one of the app's own origins.
// Auth is a bearer token (not cookies), so this is hardening, not the gate.
// No imports: the unit tests load this file directly (test/edgeShared.test.js).

const APP_ORIGINS = [
  'https://budgeer.com',
  'https://www.budgeer.com',
  'https://dev.budgeer.com',
  // Local dev and `vite preview` against the TEST project.
  'http://localhost:5173',
  'http://localhost:4173',
]

// The app origins plus APP_ORIGIN and any comma-separated CORS_ORIGINS
// (function secrets), normalised without a trailing slash.
export function allowedOrigins(appOrigin?: string | null, extra?: string | null): Set<string> {
  const all = [...APP_ORIGINS, appOrigin ?? '', ...(extra ?? '').split(',')]
  return new Set(all.map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean))
}

export function corsHeaders(origin: string | null, allowed: Set<string>): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
  if (origin && allowed.has(origin)) headers['Access-Control-Allow-Origin'] = origin
  return headers
}
