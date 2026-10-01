// Category data access, shared by every feature that reads or writes the
// user's categories. Categories are plain columns (names aren't financial
// data), so reads and writes go to the table directly under its per-verb RLS;
// the server's categories_guard stamps ownership and the CHECKs enforce the
// name/icon/colour rules. Deleting goes through delete_category, which can
// first move the category's entries (transactions have no client UPDATE path).
import { useEffect, useMemo } from 'react'
import { supabase } from './supabase.js'
import { useOwnedQuery } from './db.js'
import { useAuth } from '../auth/AuthProvider.jsx'
import { UserError, dbError } from './errors.js'
import { savingsIdsOf } from './savings.js'
import { categoryUpdateRow, newCategoryRow, sortByDisplayName } from './categoryName.js'
import { t } from './i18n/i18n.js'

// The columns a category read returns (the page list adds created_at).
const CATEGORY_COLUMNS = 'id, name, kind, icon, color, is_archived, is_savings, default_key'

// Active categories for the current user (optionally filtered by kind), live.
export function useCategories(kind) {
  const { rows: categories, loading, reload } = useOwnedQuery('categories', {
    build: (q) => {
      q = q.eq('is_archived', false).order('name')
      return kind ? q.eq('kind', kind) : q
    },
    deps: [kind],
  })
  // A–Z by the name shown (a default category in the app's language).
  const sorted = useMemo(() => sortByDisplayName(categories), [categories])
  return { categories: sorted, loading, reload }
}

// Every category the user has, archived included (live).
export function useAllCategories() {
  return useOwnedQuery('categories', {
    select: `${CATEGORY_COLUMNS}, created_at`,
    build: (q) => q.order('name'),
  })
}

// Every category the user has, archived ones included (backup/restore).
export async function listAllCategories() {
  const { data, error } = await supabase
    .from('categories').select(CATEGORY_COLUMNS).order('name')
  if (error) throw dbError(error)
  return data ?? []
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
  ? new UserError(t('categories:nameErrors.taken'))
  : dbError(error))

// `savings` (income only; the server's CHECK refuses it on an expense
// category): its entries count as saved, not as income.
export async function createCategory(fields) {
  const { error } = await supabase.from('categories').insert(newCategoryRow(fields))
  if (error) throw friendly(error)
}

// Create categories (name, kind, icon, color, is_archived, is_savings) in one
// insert (restore); RLS checks user_id is the caller's own.
export async function createCategories(userId, rows) {
  if (!rows.length) return
  const { error } = await supabase.from('categories')
    .insert(rows.map((r) => ({ ...r, user_id: userId })))
  if (error) throw dbError(error)
}

// patch: any of { name, icon, color, is_archived, is_savings }.
export async function updateCategory(id, patch) {
  const { error } = await supabase.from('categories').update(categoryUpdateRow(patch)).eq('id', id)
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

// One-time default-category seed after first login.
async function ensureSeeded() {
  const { count, error } = await supabase
    .from('categories')
    .select('id', { count: 'exact', head: true })
  if (error) throw dbError(error)
  if ((count ?? 0) === 0) {
    const { error: seedErr } = await supabase.rpc('seed_default_categories')
    if (seedErr) throw dbError(seedErr)
  }
}

// App-bootstrap hook: make sure the signed-in user has the default categories
// (once per user id). Best effort — a failure just means no defaults yet, and
// the next app load tries again.
export function useEnsureDefaultCategories() {
  const { user } = useAuth()
  const uid = user?.id
  useEffect(() => {
    if (uid) ensureSeeded().catch((e) => console.warn('[categories] seeding failed', e))
  }, [uid])
}
