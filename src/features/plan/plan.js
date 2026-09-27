// Plan mode's data layer: the reads the page needs, the one saved plan per
// account (kept on the server, encrypted — 0095), and apply/undo. The maths is
// all in planMath.js.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../shared/lib/supabase.js'
import { useLiveQuery, useOwnedQuery } from '../../shared/lib/db.js'
import { dbError } from '../../shared/lib/errors.js'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { useProfile } from '../../shared/lib/ProfileProvider.jsx'
import { useLatestRates } from '../../shared/lib/fx.js'
import { foreignCurrencies } from '../../shared/lib/ruleFx.js'
import { shiftFetchFrom } from '../../shared/lib/salaryShift.js'
import { monthRange, today } from '../../shared/lib/dates.js'
import { useRecurring } from '../recurring/recurring.js'
import { useAllCategories, useSavingsIds } from '../categories/categories.js'
import { listTransactions, useTransactions } from '../transactions/useData.js'
import { useBudgetSets } from '../budgets/budgets.js'
import {
  OVER_BUDGET_MONTHS, PRICE_MONTHS, derivedSalary, isEmptyPlan, normalisePlan, rateNeeds, recentMonths,
  salaryCategoryId, salaryWindow, storedPlan,
} from './planMath.js'

// How long the plan waits after the last edit before it's saved.
const SAVE_DELAY_MS = 800

// { plan, undo } for the signed-in user (my_recurring_plan).
async function fetchPlan() {
  const { data, error } = await supabase.rpc('my_recurring_plan')
  if (error) throw dbError(error)
  return data ?? { plan: null, undo: null }
}

// Save the plan; an empty one is removed ("Clear plan" too).
async function storePlan(plan) {
  const { error } = isEmptyPlan(plan)
    ? await supabase.rpc('clear_recurring_plan')
    : await supabase.rpc('save_recurring_plan', { p_plan: storedPlan(plan) })
  if (error) throw dbError(error)
}

// Apply the picked changes (planMath.applySelection's `apply`) and keep
// `remaining` as the plan, in one server transaction. Returns
// { applied_at, change_count, undo_until }.
export async function applyPlan(apply, remaining) {
  const { data, error } = await supabase.rpc('apply_recurring_plan', {
    p_apply: apply, p_remaining: isEmptyPlan(remaining) ? null : storedPlan(remaining),
  })
  if (error) throw dbError(error)
  return data
}

// Put the last apply back (refused after 24 hours). Returns how many changes.
export async function undoLastApply() {
  const { data, error } = await supabase.rpc('undo_recurring_plan')
  if (error) throw dbError(error)
  return data
}

// Backup and restore: the saved plan as it is, and saving one.
export async function readPlan() {
  return normalisePlan((await fetchPlan()).plan)
}
export const savePlan = storePlan

// The saved plan as the page edits it. The server's copy is read once; after
// that the page's copy is the truth and every edit is saved a moment later
// (debounced), and once more when the page closes with an edit pending.
//   plan      the plan (null until read)
//   setPlan   edit it: setPlan(next) or setPlan(prev => next)
//   replace   take a plan the server already holds (after an apply), unsaved
//   settle    stop a save still waiting and wait for one on its way, so an
//             apply's own copy of the plan is the last word
//   status    'saved' | 'saving' | 'error'
//   undo      the last apply ({ applied_at, change_count }) or null
function useSavedPlan() {
  const { user } = useAuth()
  const uid = user?.id ?? null
  const q = useLiveQuery(fetchPlan, { deps: [uid], enabled: !!uid, initial: null })
  const [plan, setPlanState] = useState(null)
  const [status, setStatus] = useState('saved')
  const dirty = useRef(false)
  const latest = useRef(null)
  const timer = useRef(null)
  const inflight = useRef(Promise.resolve())
  latest.current = plan

  useEffect(() => {
    if (q.data && latest.current === null) setPlanState(normalisePlan(q.data.plan))
  }, [q.data])

  useEffect(() => {
    if (!dirty.current || !plan) return undefined
    setStatus('saving')
    timer.current = setTimeout(() => {
      timer.current = null
      dirty.current = false
      inflight.current = storePlan(plan).then(() => setStatus('saved'), (e) => {
        console.error('[plan] save failed:', e)
        dirty.current = true
        setStatus('error')
      })
    }, SAVE_DELAY_MS)
    return () => clearTimeout(timer.current)
  }, [plan])

  // Leaving the page with an edit still waiting: save it now.
  useEffect(() => () => {
    if (dirty.current && latest.current) storePlan(latest.current).catch((e) => console.error('[plan] save failed:', e))
  }, [])

  const setPlan = useCallback((next) => {
    dirty.current = true
    setPlanState((prev) => (typeof next === 'function' ? next(prev) : next))
  }, [])
  const replace = useCallback((next) => { dirty.current = false; setPlanState(next); setStatus('saved') }, [])
  const retry = useCallback(() => setPlanState((p) => (p ? { ...p } : p)), [])
  const settle = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = null
    return inflight.current
  }, [])

  return {
    plan, setPlan, replace, settle, status, retry,
    undo: q.data?.undo ?? null, reloadUndo: q.reload,
    loading: q.loading || (!!q.data && plan === null), error: q.error, reload: q.reload,
  }
}

// The salary entries behind the derived Salary row (planMath.derivedSalary):
// the income in the salary category over the last full months, from the
// same decrypting read as every list (my_transactions), live. With the
// salary shift on it reaches back for the salary that counts in the first
// month. No category: nothing to read.
function useSalaryEntries(categoryId, todayISO) {
  const { baseCurrency, salaryShift } = useProfile()
  const win = salaryWindow(todayISO)
  const from = shiftFetchFrom(win.from, salaryShift)
  return useOwnedQuery('transactions', {
    fetch: () => (categoryId
      ? listTransactions({ kind: 'income', categoryId, from, to: win.to, baseCurrency })
      : []),
    deps: [categoryId, from, win.to, baseCurrency],
  })
}

// Everything Plan mode reads. The recurring rules are live (realtime), so
// "before" always follows the real rules; the charges and budgets behind the
// suggestions are optional — if they can't be read the page works without
// ideas. `salary` is derivedSalary's answer (null when the entries couldn't
// be read: the page works without the Salary row).
export function usePlanData() {
  const { baseCurrency = 'EUR', separateYearly, profile, salaryShift } = useProfile()
  const saved = useSavedPlan()
  const { rules, loading: rulesLoading, error: rulesError, reload: reloadRules } = useRecurring()
  const { savingsIds, loading: savingsLoading } = useSavingsIds()
  const { rows: categories, loading: categoriesLoading } = useAllCategories()

  const todayISO = today()
  const salaryCat = salaryCategoryId(profile, categories)
  const entries = useSalaryEntries(salaryCat, todayISO)
  const salary = useMemo(() => (entries.error ? null : derivedSalary({
    rules, savingsIds, categoryId: salaryCat, entries: entries.rows, todayISO, baseCurrency, salaryShift,
  })), [entries.error, entries.rows, rules, savingsIds, salaryCat, todayISO, baseCurrency, salaryShift])
  const months = useMemo(() => recentMonths(todayISO, PRICE_MONTHS), [todayISO])
  const charges = useTransactions({ kind: 'expense', from: months[0], to: monthRange().to, spread: true })
  const budgetMonths = months.slice(-OVER_BUDGET_MONTHS)
  const budgets = useBudgetSets(budgetMonths[0], budgetMonths[budgetMonths.length - 1])

  const needs = useMemo(() => rateNeeds(rules, saved.plan ?? { changes: [], adds: [] }), [rules, saved.plan])
  const fx = useLatestRates(foreignCurrencies(needs, baseCurrency), baseCurrency)
  // Only the first rates hold the page back; later ones (a new currency in
  // an add) arrive in place.
  const ratesSeen = useRef(false)
  if (!fx.loading) ratesSeen.current = true

  return {
    ...saved,
    baseCurrency, separateYearly, rules, savingsIds, categories, todayISO, salary,
    rates: fx.rates,
    charges: charges.error ? [] : charges.rows,
    budgetSets: budgets.error ? [] : budgets.sets,
    budgetMonths,
    loading: saved.loading || rulesLoading || savingsLoading || categoriesLoading || entries.loading
      || (fx.loading && !ratesSeen.current),
    error: rulesError ?? saved.error,
    reload: () => Promise.all([reloadRules(), saved.reload()]),
    reloadRules,
  }
}
