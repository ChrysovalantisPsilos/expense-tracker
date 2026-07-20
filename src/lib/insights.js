import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import { useAuth } from '../auth/AuthProvider.jsx'

// ── Net-worth accounts (manually maintained balances) ───────────────────────
export function useAccounts() {
  const { user } = useAuth()
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data } = await supabase
      .from('accounts')
      .select('*')
      .eq('is_archived', false)
      .order('created_at')
    setAccounts(data ?? [])
    setLoading(false)
  }, [user])

  useEffect(() => { load() }, [load])
  return { accounts, loading, reload: load }
}

export async function saveAccount(acc) {
  const { id, ...fields } = acc
  let q
  if (id) {
    q = supabase.from('accounts').update(fields).eq('id', id)
  } else {
    const { data: { user } } = await supabase.auth.getUser()
    q = supabase.from('accounts').insert({ ...fields, user_id: user?.id })
  }
  const { error } = await q
  if (error) throw new Error(error.message)
}

export async function deleteAccount(id) {
  const { error } = await supabase.from('accounts').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ── Savings goals ───────────────────────────────────────────────────────────
export function useGoals() {
  const { user } = useAuth()
  const [goals, setGoals] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data } = await supabase
      .from('savings_goals')
      .select('*')
      .order('created_at')
    setGoals(data ?? [])
    setLoading(false)
  }, [user])

  useEffect(() => { load() }, [load])
  return { goals, loading, reload: load }
}

export async function saveGoal(goal) {
  const { id, ...fields } = goal
  let q
  if (id) {
    q = supabase.from('savings_goals').update(fields).eq('id', id)
  } else {
    const { data: { user } } = await supabase.auth.getUser()
    q = supabase.from('savings_goals').insert({ ...fields, user_id: user?.id })
  }
  const { error } = await q
  if (error) throw new Error(error.message)
}

export async function deleteGoal(id) {
  const { error } = await supabase.from('savings_goals').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
