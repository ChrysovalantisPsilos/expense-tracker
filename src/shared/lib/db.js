import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase.js'
import { useAuth } from '../auth/AuthProvider.jsx'
import { useLiveRefetch } from './realtime.js'
import { dbError } from './errors.js'
import { liveQueryCache, queryCacheKey } from './queryCache.js'

// The app's one live-query hook: fetch, keep it fresh over realtime, and never
// leave a page spinning.
//
//   fetcher  — async () => data. Always called through a ref, so it may be an
//              inline closure; list what it closes over in `deps`.
//   key      — realtime channel key; null disables realtime (a one-shot read).
//   specs    — [{ table, filter? }] realtime triggers (see useLiveRefetch).
//   deps     — re-fetch when any of these change.
//   enabled  — false: don't fetch at all (e.g. no user yet, a closed modal).
//   initial  — `data` before the first answer.
//   keepPrevious — on a deps change, keep showing the old data until the new
//              answer lands (default). false: reset to `initial` + loading.
//   cacheKey — remember the last answer under this key (queryCache.js; it
//              must name every input of the answer): mounting again with a
//              known key shows that answer at once, not loading, and
//              refreshes it in the background like a live refetch.
//
// Returns { data, loading, error, reload, mutate }:
//   loading — true until the first answer (success or failure) for the
//             current deps; live refetches swap data in place, no spinner.
//   error   — set when there's nothing valid to show: the first load for the
//             current deps failed, or an explicit reload() failed. A failed
//             background refetch keeps the last good data (and is logged)
//             rather than replacing a working page with an error.
//   reload  — refetch now; returns a promise; surfaces errors (Retry buttons).
//   mutate  — optimistic local edit: mutate(next) or mutate(prev => next).
//
// Races: each request takes a sequence number and only the newest may write
// state, so a slow old answer can never overwrite a newer one (fast search
// typing, quick navigation). Unmounting or changing deps invalidates
// in-flight requests.
export function useLiveQuery(fetcher, {
  key = null, specs = [], deps = [], enabled = true, initial, keepPrevious = true, cacheKey = null,
} = {}) {
  const cacheRef = useRef(null)
  cacheRef.current = enabled ? cacheKey : null
  const [state, setState] = useState(() => {
    const hit = cacheRef.current && liveQueryCache.get(cacheRef.current)
    return hit ? { data: hit.data, loading: false, error: null } : { data: initial, loading: true, error: null }
  })
  const fetchRef = useRef(fetcher)
  fetchRef.current = fetcher
  const seq = useRef(0)
  const good = useRef(false) // a successful answer is on screen for these deps

  const run = useCallback(async (surface) => {
    const my = ++seq.current
    const cached = cacheRef.current // the key of the inputs this fetch reads
    try {
      const data = await fetchRef.current()
      if (my !== seq.current) return
      good.current = true
      if (cached) liveQueryCache.set(cached, data)
      setState({ data, loading: false, error: null })
    } catch (error) {
      if (my !== seq.current) return
      if (!surface && good.current) {
        console.warn('[live-query] background refresh failed; keeping last data', error)
        return
      }
      console.error('[live-query] read failed', error)
      setState((s) => ({ ...s, loading: false, error }))
    }
    // deps are the caller's declared inputs to fetcher (read via the ref).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    if (!enabled) return undefined
    // A cached answer for these deps is on screen at once; the fetch then
    // refreshes it quietly (a failure keeps it, as for a live refetch).
    const hit = cacheRef.current && liveQueryCache.get(cacheRef.current)
    good.current = !!hit
    if (hit) {
      setState((s) => (s.data === hit.data && !s.loading && !s.error ? s
        : { data: hit.data, loading: false, error: null }))
    } else {
      // New deps: clear a stale error (and, unless keepPrevious, the old data).
      setState((s) => (keepPrevious && !s.error ? s
        : { data: keepPrevious ? s.data : initial, loading: true, error: null }))
    }
    run(!hit)
    // Drop answers for the old deps / after unmount. Bumping the live counter
    // is the point here (it's not a DOM ref), so the "stale ref" lint is moot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { seq.current++ }
    // initial/keepPrevious are fixed per call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, enabled])

  useLiveRefetch(enabled ? key : null, specs, () => run(false))

  // A newer answer stored under this cacheKey elsewhere (another mount's
  // fetch, or a save that stores its result) shows here at once.
  useEffect(() => {
    const k = enabled ? cacheKey : null
    if (!k) return undefined
    return liveQueryCache.subscribe(k, (data) => setState((s) => (s.data === data && !s.loading && !s.error ? s
      : { data, loading: false, error: null })))
  }, [cacheKey, enabled])

  const reload = useCallback(() => run(true), [run])
  const mutate = useCallback((next) => setState((s) => {
    const data = typeof next === 'function' ? next(s.data) : next
    // Quiet: this runs inside a state update, where other components mustn't
    // be set; mutate is this mount's own optimistic edit.
    if (cacheRef.current) liveQueryCache.set(cacheRef.current, data, { quiet: true })
    return { ...s, data }
  }), [])

  return { ...state, reload, mutate }
}

// Read hook for the signed-in user's own rows (RLS scopes them). `build(q)`
// refines the base `from(table).select(select)` query; `deps` lists every
// value that query closes over so it re-runs when they change.
// Returns { rows, loading, error, reload, mutate }.
//
// Every owned query is LIVE: it re-fetches when any of the user's rows in
// `table` change — from another tab or device, or server-side (a friend's
// group expense mirroring a share into your transactions, the nightly
// recurring materializer, …). No page needs its own subscription or polling.
//
// `fetch` override: encrypted tables read through a decrypting RPC instead of
// a direct select. Realtime still subscribes to `table` (a real table), so live
// updates trigger a refetch through the RPC just the same.
//
// `cacheAs` names the query for the in-memory cache (useLiveQuery's cacheKey),
// for reads a page shows on mounting (Home's cards): the name tells apart
// two queries of one table whose `build`/`fetch` differ.
//
// Keyed on user.id, not the user object: AuthProvider hands out a new session
// object on every token refresh, which must not refetch every page.
export function useOwnedQuery(table, { select = '*', build, deps = [], fetch, cacheAs } = {}) {
  const { user } = useAuth()
  const uid = user?.id ?? null
  const { data, ...rest } = useLiveQuery(async () => {
    if (fetch) return (await fetch()) ?? []
    let q = supabase.from(table).select(select)
    if (build) q = build(q)
    const { data: rows, error } = await q
    if (error) throw dbError(error)
    return rows ?? []
  }, {
    key: uid ? `owned:${table}` : null,
    specs: [{ table, filter: uid ? `user_id=eq.${uid}` : undefined }],
    deps: [uid, table, select, ...deps],
    enabled: !!uid,
    initial: [],
    cacheKey: uid && cacheAs ? queryCacheKey(cacheAs, [uid, table, select, ...deps]) : null,
  })
  return { rows: data, ...rest }
}

// A decrypting read RPC's rows (encrypted tables: accounts, goals…); [] when
// it answers nothing.
export async function rpcRows(name, args) {
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw dbError(error)
  return data ?? []
}

export async function removeRow(table, id) {
  const { error } = await supabase.from(table).delete().eq('id', id)
  if (error) throw dbError(error)
}

export async function patchRow(table, id, patch) {
  const { error } = await supabase.from(table).update(patch).eq('id', id)
  if (error) throw dbError(error)
}
