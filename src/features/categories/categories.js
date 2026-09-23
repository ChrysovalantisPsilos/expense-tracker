// Category data access. Categories are plain columns (names aren't financial
// data), so the page reads and writes the table directly under its per-verb
// RLS; the server's categories_guard stamps ownership and the CHECKs enforce
// the name/icon/colour rules. Deleting goes through delete_category, which can
// first move the category's entries (transactions have no client UPDATE path).
import { supabase } from '../../shared/lib/supabase.js'
import { useOwnedQuery } from '../../shared/lib/db.js'

// Every category the user has, archived included (live).
export function useAllCategories() {
  return useOwnedQuery('categories', {
    select: 'id, name, kind, icon, color, is_archived',
    build: (q) => q.order('name'),
  })
}

const friendly = (error) => (error.code === '23505'
  ? 'You already have a category with that name.'
  : error.message)

export async function createCategory({ name, kind, icon, color }) {
  const { error } = await supabase.from('categories')
    .insert({ name: name.trim(), kind, icon: icon ?? null, color: color ?? null })
  if (error) throw new Error(friendly(error))
}

// patch: any of { name, icon, color, is_archived }.
export async function updateCategory(id, patch) {
  const { error } = await supabase.from('categories')
    .update(patch.name != null ? { ...patch, name: patch.name.trim() } : patch).eq('id', id)
  if (error) throw new Error(friendly(error))
}

// How many of the user's transactions use a category (a cheap head count).
export async function countCategoryUse(id) {
  const { count, error } = await supabase.from('transactions')
    .select('id', { count: 'exact', head: true }).eq('category_id', id)
  if (error) throw new Error(error.message)
  return count ?? 0
}

// Delete a category, first moving its entries to `moveTo` (null = leave them
// uncategorised). Returns how many entries moved.
export async function deleteCategory(id, moveTo = null) {
  const { data, error } = await supabase.rpc('delete_category', { p_category: id, p_move_to: moveTo })
  if (error) throw new Error(error.message)
  return data ?? 0
}
