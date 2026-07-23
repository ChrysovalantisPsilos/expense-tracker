import { useOwnedQuery, upsertOwned, removeRow, patchRow } from '../../shared/lib/db.js'

// Pure math lives in recurringMath.js (unit-tested); re-exported for callers.
export {
  FREQUENCIES, monthlyMinor, frequencyLabel, expectedInWindow,
} from './recurringMath.js'

// The user's recurring rules — active first, then by next charge date.
export function useRecurring() {
  const { rows: rules, loading, reload } = useOwnedQuery('recurring_rules', {
    select: '*, categories(name, icon)',
    build: (q) => q.order('is_active', { ascending: false }).order('next_run', { ascending: true }),
  })
  return { rules, loading, reload }
}

export const saveRecurring = (rule) => upsertOwned('recurring_rules', rule)
export const setRecurringActive = (id, isActive) => patchRow('recurring_rules', id, { is_active: isActive })
export const deleteRecurring = (id) => removeRow('recurring_rules', id)
