// Settings › Import rules: data access. Rules are plain columns (a merchant's
// name and a category id), read and written on the table directly under its
// per-verb RLS (0058); the server's category_rules_guard (0093) stamps the
// owner, keeps a rule on the owner's own categories and trims the pattern.
// The import wizard's own reads and upserts are in importExpenses.js.
import { supabase } from '../../shared/lib/supabase.js'
import { useOwnedQuery, removeRow } from '../../shared/lib/db.js'
import { UserError, dbError } from '../../shared/lib/errors.js'
import { cleanPattern } from './importRulesMath.js'
import { t } from '../../shared/lib/i18n/i18n.js'

// Every rule the user has (live: an import in another tab adds to the list).
export function useImportRules() {
  return useOwnedQuery('category_rules', { select: 'id, pattern, category_id, created_at' })
}

// patch: { pattern, category_id }. The same text as another rule (the table
// is unique per user and pattern) is the refusal worth telling the user.
export async function updateRule(id, { pattern, category_id: categoryId }) {
  const { error } = await supabase.from('category_rules')
    .update({ pattern: cleanPattern(pattern), category_id: categoryId }).eq('id', id)
  if (error) {
    throw error.code === '23505' ? new UserError(t('import:rules.errors.taken')) : dbError(error)
  }
}

export const deleteRule = (id) => removeRow('category_rules', id)
