// Transaction data access, shared by every feature that reads or writes the
// user's entries (Home, Transactions, Categories, Budgets, Insights, Savings,
// Meal vouchers, Plan, Import, Backup).
import { useCallback, useRef, useState } from 'react'
import { supabase } from './supabase.js'
import { useLiveQuery, useOwnedQuery } from './db.js'
import { useProfile } from './ProfileProvider.jsx'
import { fillPendingRates } from './fx.js'
import { dbError } from './errors.js'
import { announceChange } from './realtime.js'

// Transactions in a date range (defaults to current month). Optional
// `categoryId` and `limit` narrow the query server-side (used by search);
// `paidFromSavings` keeps only expenses paid from savings (0085: net worth's
// Savings line).
// `mutate` lets callers optimistically update the list (edit/delete).
//
// Amounts, descriptions and notes are encrypted at rest, so rows come from the
// decrypting `my_transactions` RPC (newest first; same-day rows tie-break by
// insertion time). Each row keeps the old select's shape: `categories` and,
// for mirrored group expenses, `group_expenses.groups.name` (so the dashboard
// can bucket them under the group). Realtime still watches the base table.
// A row whose rate the server hasn't filled in yet comes back with the ECB
// rate for its date and `rate_estimated: true` (see fillPendingRates).
//
// `spread: true` (monthly-spend views) also returns the yearly-subscription
// rows paid before `from` that still count in the range (spread_months, 0067):
// feed the rows to shared/lib/spread.js — spendRows for totals, paidInWindow
// for what to list. With pay months on (payCalendar.js) `from`/`to` are the
// pay month's window, and every row is read by its real date.
export function useTransactions({
  kind, from, to, categoryId, limit, spread = false, paidFromSavings = false, paidWithVouchers = false,
} = {}) {
  const { baseCurrency } = useProfile()
  return useOwnedQuery('transactions', {
    cacheAs: 'transactions',
    fetch: () => listTransactions({
      kind, from, to, categoryId, limit, spread, paidFromSavings, paidWithVouchers, baseCurrency,
    }),
    deps: [kind, from, to, categoryId, limit, spread, paidFromSavings, paidWithVouchers, baseCurrency],
  })
}

// One-shot read behind useTransactions (same filters, same row shape). Pass
// `baseCurrency` to have pending rates estimated.
export async function listTransactions({
  kind, from, to, categoryId, limit, spread = false, paidFromSavings = false, paidWithVouchers = false, baseCurrency,
} = {}) {
  const { data, error } = await supabase.rpc('my_transactions', {
    p_kind: kind ?? null, p_from: from ?? null, p_to: to ?? null,
    p_category: categoryId ?? null, p_limit: limit ?? null, p_spread: spread,
    // Sent only when set, so every other read keeps its cache key (offline).
    ...(paidFromSavings ? { p_paid_from_savings: true } : {}),
    ...(paidWithVouchers ? { p_paid_with_vouchers: true } : {}),
  })
  if (error) throw dbError(error)
  return baseCurrency ? fillPendingRates(data ?? [], baseCurrency) : data ?? []
}

// One transaction (the transaction page), same row shape as useTransactions.
// `known` is the row the list already had (router state): used as is, so
// opening an entry costs no request. Opened from a bare link or a reload, it's
// looked up in the user's history — the same decrypting read, so it is
// served from the offline cache too. `row` is null when there's no such entry.
export function useTransaction(id, known) {
  const { baseCurrency } = useProfile()
  const { data, loading, error, reload } = useLiveQuery(
    async () => known ?? (await listTransactions({ baseCurrency })).find((r) => r.id === id) ?? null,
    { deps: [id, baseCurrency], enabled: !!id, initial: null, keepPrevious: false })
  return { row: data, loading: !!id && loading, error, reload }
}

// How many transactions the user has in total (a cheap head count).
export async function countTransactions() {
  const { count, error } = await supabase
    .from('transactions').select('id', { count: 'exact', head: true })
  if (error) throw dbError(error)
  return count ?? 0
}

// The date (YYYY-MM-DD) of the user's first transaction: null when there are
// none, and undefined when it couldn't be read (so a failed read never looks
// like an empty account).
export async function oldestTransactionDate() {
  const { data, error } = await supabase
    .from('transactions')
    .select('spent_at')
    .order('spent_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) return undefined
  return data?.spent_at ?? null
}

// oldestTransactionDate as state (undefined until known) plus `recheck`, which
// asks again — pages call it as their live rows change, so importing older
// data extends their periods without a reload (a cheap 1-row query). An
// answer that arrives after a newer ask is dropped.
export function useOldestTransactionDate() {
  const [oldest, setOldest] = useState(undefined)
  const asked = useRef(0)
  const recheck = useCallback(() => {
    const ask = ++asked.current
    oldestTransactionDate().then((date) => { if (ask === asked.current) setOldest(date) })
  }, [])
  return [oldest, recheck]
}

// The user's paydays (pay months, 0111): the dates of the income rows in
// their salary category that the server counts as paydays (pay_days: at
// least half the median salary, so amounts never leave the server) and the
// user's today on the server, { days, today }. Read only while the salary
// setting is on (`shift`, salaryShiftOf); live with the transactions, so a
// salary saved opens its month at once. Cached for offline reads
// (OFFLINE_READ_RPCS).
export function usePayDays(shift) {
  const on = !!shift
  return useOwnedQuery('transactions', {
    cacheAs: 'payCalendar',
    fetch: () => (on ? payCalendarDays() : null),
    deps: [on, shift?.fromDay, shift?.categoryId],
  })
}

async function payCalendarDays() {
  const { data, error } = await supabase.rpc('my_pay_calendar')
  if (error) throw dbError(error)
  return { days: data?.days ?? [], today: data?.today ?? null }
}

// Direct writes to the transactions table. Login is required (and reads are
// served from the service-worker cache when offline), so there's no offline
// write queue — a write that can't reach the server just fails and the caller
// shows an offline-aware toast.
//
// Amounts, descriptions and notes are encrypted at rest, so writes go through
// encrypting RPCs (the server forces user_id and ignores unknown fields).
// Inserts still carry a client_uuid and upsert on (user_id, client_uuid): if a
// submit's response is lost but the row actually landed, retrying the same
// submit updates that row instead of creating a duplicate. Callers keep the
// client_uuid stable across retries of one submit and rotate it after success.
export async function insertTransaction(row) {
  const client_uuid = row.client_uuid ?? crypto.randomUUID()
  const { error } = await supabase.rpc('save_transactions', { p_rows: [{ ...row, client_uuid }] })
  if (error) throw dbError(error)
  announceChange('transactions')
}

// Patch a transaction: only the keys present in `fields` change.
export async function updateTransaction(id, fields) {
  const { error } = await supabase.rpc('update_transaction', { p_id: id, p_patch: fields })
  if (error) throw dbError(error)
  announceChange('transactions')
}

export async function deleteTransaction(id) {
  const { error } = await supabase.from('transactions').delete().eq('id', id)
  if (error) throw dbError(error)
  announceChange('transactions')
}
