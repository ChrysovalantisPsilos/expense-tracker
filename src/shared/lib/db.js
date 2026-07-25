import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import { useAuth } from '../auth/AuthProvider.jsx'
import { useLiveRefetch } from './realtime.js'

// Generic read hook for the signed-in user's own rows (RLS scopes them).
// `build(q)` refines the base `from(table).select(select)` query; `deps` lists
// every value that query closes over so it re-runs when they change.
// Returns { rows, loading, reload, mutate } — `mutate` allows optimistic edits.
//
// Every owned query is LIVE: it re-fetches when any of the user's rows in
// `table` change — from another tab or device, or server-side (a friend's
// group expense mirroring a share into your transactions, the nightly
// recurring materializer, …). No page needs its own subscription or polling.
export function useOwnedQuery(table, { select = '*', build, deps = [], fetch } = {}) {
  const { user } = useAuth()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!user) return
    // No setLoading(true) here: live refetches (realtime, reconnect, tab
    // focus) swap data in place without flashing the page's spinner. The
    // initial `true` covers first paint.
    //
    // `fetch` override: encrypted tables read through a decrypting RPC instead
    // of a direct select. Realtime still subscribes to `table` below (a real
    // table), so live updates trigger a refetch through the RPC just the same.
    let data
    if (fetch) {
      data = await fetch()
    } else {
      let q = supabase.from(table).select(select)
      if (build) q = build(q)
      ;({ data } = await q)
    }
    setRows(data ?? [])
    setLoading(false)
    // build/fetch are recreated each render but only close over values in deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, table, select, ...deps])

  useEffect(() => { load() }, [load])
  useLiveRefetch(
    user ? `owned:${table}` : null,
    [{ table, filter: user ? `user_id=eq.${user.id}` : undefined }],
    load,
  )
  return { rows, loading, reload: load, mutate: setRows }
}

// Insert (stamping user_id so the own-rows RLS check passes) or update by id.
export async function upsertOwned(table, { id, ...fields }) {
  if (id) {
    const { error } = await supabase.from(table).update(fields).eq('id', id)
    if (error) throw new Error(error.message)
    return
  }
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase.from(table).insert({ ...fields, user_id: user?.id })
  if (error) throw new Error(error.message)
}

export async function removeRow(table, id) {
  const { error } = await supabase.from(table).delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function patchRow(table, id, patch) {
  const { error } = await supabase.from(table).update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}
