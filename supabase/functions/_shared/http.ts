// Shared HTTP helpers for the browser-called edge functions: a CORS wrapper
// pinned to the app's origins, a JSON responder, and a caller-scoped Supabase
// client (anon key + the caller's JWT, so RLS applies as that user).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { allowedOrigins, corsHeaders } from './cors.ts'

const ALLOWED = allowedOrigins(Deno.env.get('APP_ORIGIN'), Deno.env.get('CORS_ORIGINS'))

// Wrap a handler: answers the preflight, and stamps the CORS headers on
// every response the handler returns.
export function withCors(handler: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    const headers = corsHeaders(req.headers.get('Origin'), ALLOWED)
    if (req.method === 'OPTIONS') return new Response('ok', { headers })
    const res = await handler(req)
    for (const [k, v] of Object.entries(headers)) res.headers.set(k, v)
    return res
  }
}

export function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// A Supabase client bound to the caller's session. Everything it reads/writes
// is filtered by RLS as the caller — no service role. Check auth via getUser().
export function callerClient(req: Request) {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
  )
}
