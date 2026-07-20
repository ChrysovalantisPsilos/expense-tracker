import { useOwnedQuery, upsertOwned, removeRow } from './db.js'

// ── Net-worth accounts (manually maintained balances) ───────────────────────
export function useAccounts() {
  const { rows: accounts, loading, reload } = useOwnedQuery('accounts', {
    build: (q) => q.eq('is_archived', false).order('created_at'),
  })
  return { accounts, loading, reload }
}

export const saveAccount = (acc) => upsertOwned('accounts', acc)
export const deleteAccount = (id) => removeRow('accounts', id)

// ── Savings goals ───────────────────────────────────────────────────────────
export function useGoals() {
  const { rows: goals, loading, reload } = useOwnedQuery('savings_goals', {
    build: (q) => q.order('created_at'),
  })
  return { goals, loading, reload }
}

export const saveGoal = (goal) => upsertOwned('savings_goals', goal)
export const deleteGoal = (id) => removeRow('savings_goals', id)
