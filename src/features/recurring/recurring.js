import { useOwnedQuery, removeRow } from '../../shared/lib/db.js'
import { supabase } from '../../shared/lib/supabase.js'

// Pure math lives in recurringMath.js (unit-tested); re-exported for callers.
export {
  FREQUENCIES, monthlyMinor, frequencyLabel, expectedInWindow,
} from './recurringMath.js'

// A rule's amount and description are encrypted at rest, so reads go through
// the decrypting `my_recurring_rules` RPC (active first, then by next charge
// date; rows keep the `categories` embed) and writes through the encrypting
// `save_recurring_rule` (the server forces user_id; on update only the keys
// sent change). Realtime still watches the base table.
export function useRecurring() {
  const { rows: rules, loading, error, reload } = useOwnedQuery('recurring_rules', { fetch: listRecurring })
  return { rules, loading, error, reload }
}

export async function listRecurring() {
  const { data, error } = await supabase.rpc('my_recurring_rules')
  if (error) throw new Error(error.message)
  return data ?? []
}

async function saveRule(id, fields) {
  const { error } = await supabase.rpc('save_recurring_rule', { p_id: id ?? null, p_fields: fields })
  if (error) throw new Error(error.message)
}

export const saveRecurring = ({ id, ...fields }) => saveRule(id, fields)
export const setRecurringActive = (id, isActive) => saveRule(id, { is_active: isActive })
export const deleteRecurring = (id) => removeRow('recurring_rules', id)
