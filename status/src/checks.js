// The four probes, run in parallel, each with its own timeout. The meaning of
// each answer lives in state.js; this file only makes the requests.
//
//   app      GET APP_URL                                  expects 200
//   auth     GET  SUPABASE_URL/auth/v1/health             apikey header
//   db       POST SUPABASE_URL/rest/v1/rpc/status_snapshot apikey header;
//            the JSON body carries the email and exchange-rate signals
//   reports  OPTIONS SUPABASE_URL/functions/v1/generate-report with
//            Origin: APP_URL — the CORS preflight is answered by the function
//            itself without auth, so a 200 means the Edge Function is up.
//
// Without SUPABASE_ANON_KEY the two key-based probes are skipped (→ unknown).
import { TIMEOUT_MS } from './state.js'

async function timed(fetchImpl, url, init, readJson = false) {
  const t0 = Date.now()
  try {
    const res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) })
    const body = readJson ? await res.json().catch(() => null) : null
    if (!readJson) await res.body?.cancel()
    return { status: res.status, latencyMs: Date.now() - t0, body }
  } catch (e) {
    return { error: e?.name === 'TimeoutError' ? 'timeout' : 'network', latencyMs: Date.now() - t0 }
  }
}

export async function probeAll(env, fetchImpl = fetch) {
  const base = String(env.SUPABASE_URL || '').replace(/\/+$/, '')
  const key = env.SUPABASE_ANON_KEY
  const keyed = (path, init, readJson) => (key
    ? timed(fetchImpl, base + path, { ...init, headers: { apikey: key, ...init.headers } }, readJson)
    : Promise.resolve({ skipped: true }))
  const ua = { 'user-agent': 'budgeer-status (+status page checks)' }

  const [app, auth, db, reports] = await Promise.all([
    timed(fetchImpl, env.APP_URL, { headers: ua }),
    keyed('/auth/v1/health', { headers: ua }),
    keyed('/rest/v1/rpc/status_snapshot', {
      method: 'POST', body: '{}', headers: { ...ua, 'content-type': 'application/json' },
    }, true),
    timed(fetchImpl, `${base}/functions/v1/generate-report`, {
      method: 'OPTIONS',
      headers: {
        ...ua, origin: env.APP_URL, 'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization, content-type, apikey',
      },
    }),
  ])
  return { app, auth, db, reports }
}
