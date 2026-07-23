// Shared HTTP helpers for the edge functions: identical CORS headers, a JSON
// responder that carries them, and a caller-scoped Supabase client (anon key +
// the caller's JWT, so RLS applies as that user).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
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
