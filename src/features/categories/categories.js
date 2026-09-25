// Category data access. Categories are plain columns (names aren't financial
// data), so the page reads and writes the table directly under its per-verb
// RLS; the server's categories_guard stamps ownership and the CHECKs enforce
// the name/icon/colour rules. Deleting goes through delete_category, which can
// first move the category's entries (transactions have no client UPDATE path).
import { useMemo } from 'react'
import { supabase } from '../../shared/lib/supabase.js'
import { useOwnedQuery } from '../../shared/lib/db.js'
import { UserError, dbError } from '../../shared/lib/errors.js'
import { savingsIdsOf } from '../../shared/lib/savings.js'

// Every category the user has, archived included (live).
export function useAllCategories() {
  return useOwnedQuery('categories', {
    select: 'id, name, kind, icon, color, is_archived, is_savings, created_at',
    build: (q) => q.order('name'),
  })
}

// The ids of the user's savings categories (archived included), live. Every
// income sum leaves their entries out (shared/lib/savings.js); `loading` is
// true until they're known, so a total never flashes with savings counted.
export function useSavingsIds() {
  const { rows, loading } = useOwnedQuery('categories', {
    select: 'id, kind, is_savings',
    build: (q) => q.eq('is_savings', true),
  })
  const savingsIds = useMemo(() => savingsIdsOf(rows), [rows])
  return { savingsIds, loading }
}

// A duplicate name is the one database refusal worth telling the user about.
const friendly = (error) => (error.code === '23505'
  ? new UserError('You already have a category with that name.')
  : dbError(error))

// `savings` (income only; the server's CHECK refuses it on an expense
// category): its entries count as saved, not as income.
export async function createCategory({ name, kind, icon, color, savings = false }) {
  const { error } = await supabase.from('categories').insert({
    name: name.trim(), kind, icon: icon ?? null, color: color ?? null,
    is_savings: kind === 'income' && savings,
  })
  if (error) throw friendly(error)
}

// patch: any of { name, icon, color, is_archived, is_savings }.
export async function updateCategory(id, patch) {
  const { error } = await supabase.from('categories')
    .update(patch.name != null ? { ...patch, name: patch.name.trim() } : patch).eq('id', id)
  if (error) throw friendly(error)
}

// How many of the user's transactions use a category (a cheap head count).
export async function countCategoryUse(id) {
  const { count, error } = await supabase.from('transactions')
    .select('id', { count: 'exact', head: true }).eq('category_id', id)
  if (error) throw dbError(error)
  return count ?? 0
}

// Delete a category, first moving its entries to `moveTo` (null = leave them
// uncategorised). Returns how many entries moved.
export async function deleteCategory(id, moveTo = null) {
  const { data, error } = await supabase.rpc('delete_category', { p_category: id, p_move_to: moveTo })
  if (error) throw dbError(error)
  return data ?? 0
}
