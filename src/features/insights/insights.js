import { useOwnedQuery, removeRow, rpcRows } from '../../shared/lib/db.js'
import { supabase } from '../../shared/lib/supabase.js'
import { dbError } from '../../shared/lib/errors.js'

// Balances are encrypted at rest (pgcrypto + Vault key), so there are no
// plaintext columns to select — reads go through a decrypting RPC and writes
// through an encrypting one. Realtime still subscribes to the base table (via
// useOwnedQuery), so edits from another device refresh live. (Savings goals
// live with the Savings page: features/savings/savings.js.)

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
