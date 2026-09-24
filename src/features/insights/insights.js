import { useOwnedQuery, removeRow } from '../../shared/lib/db.js'
import { supabase } from '../../shared/lib/supabase.js'
import { dbError } from '../../shared/lib/errors.js'

// Balances and goal amounts are encrypted at rest (pgcrypto + Vault key), so
// there are no plaintext columns to select — reads go through decrypting RPCs
// and writes through encrypting RPCs. Realtime still subscribes to the base
// table (via useOwnedQuery), so edits from another device refresh live.

async function rpcRows(name, args) {
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw dbError(error)
  return data ?? []
}

// ── Net-worth accounts (manually maintained balances) ───────────────────────
export function useAccounts() {
  const { rows: accounts, loading, error, reload } = useOwnedQuery('accounts', { fetch: listAccounts })
  return { accounts, loading, error, reload }
}

export const listAccounts = () => rpcRows('my_accounts')

export async function saveAccount(acc) {
  const { error } = await supabase.rpc('save_account', {
    p_id: acc.id ?? null, p_name: acc.name, p_type: acc.type,
    p_balance: acc.balance_minor, p_currency: acc.currency,
  })
  if (error) throw dbError(error)
}
export const deleteAccount = (id) => removeRow('accounts', id)

// ── Savings goals ───────────────────────────────────────────────────────────
export function useGoals() {
  const { rows: goals, loading, error, reload } = useOwnedQuery('savings_goals', { fetch: listGoals })
  return { goals, loading, error, reload }
}

export const listGoals = () => rpcRows('my_goals')

export async function saveGoal(goal) {
  const { error } = await supabase.rpc('save_goal', {
    p_id: goal.id ?? null, p_name: goal.name,
    p_target: goal.target_minor, p_saved: goal.saved_minor,
    p_currency: goal.currency, p_target_date: goal.target_date ?? null,
  })
  if (error) throw dbError(error)
}
export const deleteGoal = (id) => removeRow('savings_goals', id)
