import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import { useAuth } from '../auth/AuthProvider.jsx'

// Generic read hook for the signed-in user's own rows (RLS scopes them).
// `build(q)` refines the base `from(table).select(select)` query; `deps` lists
// every value that query closes over so it re-runs when they change.
// Returns { rows, loading, reload, mutate } — `mutate` allows optimistic edits.
export function useOwnedQuery(table, { select = '*', build, deps = [] } = {}) {
  const { user } = useAuth()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    let q = supabase.from(table).select(select)
    if (build) q = build(q)
    const { data } = await q
    setRows(data ?? [])
    setLoading(false)
    // build is recreated each render but only closes over values listed in deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, table, select, ...deps])

  useEffect(() => { load() }, [load])
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
