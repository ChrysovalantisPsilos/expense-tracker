import { useCallback, useMemo } from 'react'
import { useOwnedQuery, removeRow, rpcRows } from '../../shared/lib/db.js'
import { supabase } from '../../shared/lib/supabase.js'
import { dbError } from '../../shared/lib/errors.js'
import { useProfile } from '../../shared/lib/ProfileProvider.jsx'
import { savingsPotMinor, savingsTotal } from '../../shared/lib/savings.js'
import { useTransactions } from '../transactions/useData.js'
import { useAccounts } from '../insights/insights.js'
import { useSavingsIds } from '../categories/categories.js'
import { savingsMoves } from './savingsMath.js'

// ── The savings pot's entries ───────────────────────────────────────────────
// Everything that ever moved the pot: every income entry (the savings ones
// are picked out by category) and every expense paid from savings (0085).
// The two reads are exactly the ones Insights' net worth makes, and both are
// cached under the same keys (useTransactions' cacheAs), so moving between
// Insights and Savings shows the last answer at once instead of fetching
// twice. Both are live (useOwnedQuery → useLiveRefetch on transactions).
//   moves      the rows that touch savings, newest first (savingsMoves)
//   pot        the pot's total, all time, in the base currency (minor units)
//   savingsIds the user's savings categories
//   loading    until all three reads have answered
export function useSavingsMoves() {
  const { baseCurrency = 'EUR' } = useProfile()
  const { savingsIds, loading: idsLoading } = useSavingsIds()
  const income = useTransactions({ kind: 'income' })
  const fromSavings = useTransactions({ kind: 'expense', paidFromSavings: true })
  const moves = useMemo(
    () => savingsMoves([...income.rows, ...fromSavings.rows], savingsIds),
    [income.rows, fromSavings.rows, savingsIds])
  const pot = useMemo(() => savingsPotMinor(moves, savingsIds, baseCurrency), [moves, savingsIds, baseCurrency])
  const { reload: reloadIncome } = income
  const { reload: reloadFromSavings } = fromSavings
  const reload = useCallback(
    () => Promise.all([reloadIncome(), reloadFromSavings()]), [reloadIncome, reloadFromSavings])
  return {
    moves, pot, savingsIds, baseCurrency,
    loading: idsLoading || income.loading || fromSavings.loading,
    error: income.error ?? fromSavings.error,
    reload,
  }
}

// ── The savings total ───────────────────────────────────────────────────────
// useSavingsMoves plus the user's net-worth accounts (live, the same read
// Insights makes): `total` is savingsTotal — the savings accounts' balances
// when there are any (0092), else the pot from the entries — and `loading`
// waits for the accounts too, so the total never flashes from one source to
// the other.
export function useSavingsBalance() {
  const moves = useSavingsMoves()
  const { accounts, loading, error, reload: reloadAccounts } = useAccounts()
  const total = useMemo(() => savingsTotal(accounts, moves.pot), [accounts, moves.pot])
  const { reload: reloadMoves } = moves
  const reload = useCallback(() => Promise.all([reloadMoves(), reloadAccounts()]), [reloadMoves, reloadAccounts])
  return { ...moves, total, loading: moves.loading || loading, error: moves.error ?? error, reload }
}

// ── Savings goals ───────────────────────────────────────────────────────────
// Goal amounts are encrypted at rest (pgcrypto + Vault key): reads go through
// the decrypting my_goals RPC and writes through the encrypting save_goal.
// Realtime still watches the base table, so an edit on another device shows.
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
