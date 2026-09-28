// Meal vouchers' data layer: the one setup per account (kept on the server,
// encrypted — 0097), saving it, and the card as the pages show it. The maths
// is all in voucherMath.js.
import { useMemo } from 'react'
import { supabase } from '../../shared/lib/supabase.js'
import { useLiveQuery } from '../../shared/lib/db.js'
import { dbError } from '../../shared/lib/errors.js'
import { liveQueryCache } from '../../shared/lib/queryCache.js'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { today } from '../../shared/lib/dates.js'
import { useTransactions } from '../transactions/useData.js'
import { nextTopUp, voucherHistory, voucherSummary } from './voucherMath.js'

// The signed-in user's setup, or null when they don't get meal vouchers.
export async function readMealVouchers() {
  const { data, error } = await supabase.rpc('my_meal_vouchers')
  if (error) throw dbError(error)
  return data ?? null
}

// The setup's cache key (useLiveQuery's cacheKey) for a user.
const cacheKeyOf = (uid) => `vouchers:${uid}`

// Save `uid`'s setup (null turns vouchers off). The saved copy goes straight
// into the cache, so the next page to show the card starts from it.
export async function saveMealVouchers(uid, settings) {
  const { error } = await supabase.rpc('save_meal_vouchers', { p: settings })
  if (error) throw dbError(error)
  liveQueryCache.set(cacheKeyOf(uid), settings)
}

// { settings, loading, error, reload }: the setup, read on every mount.
export function useMealVouchers() {
  const { user } = useAuth()
  const uid = user?.id ?? null
  const q = useLiveQuery(readMealVouchers, {
    deps: [uid], enabled: !!uid, initial: null, cacheKey: uid ? cacheKeyOf(uid) : null,
  })
  return { settings: q.data, loading: q.loading, error: q.error, reload: q.reload }
}

// The card: what's on it (voucherSummary), the next top-up and the history,
// from the expenses paid with vouchers — live, like every ledger read.
// `card` is null without a setup.
export function useVoucherCard(settings) {
  const spends = useTransactions({ kind: 'expense', paidWithVouchers: true })
  const day = today()
  const card = useMemo(() => (settings ? {
    summary: voucherSummary(settings, spends.rows, day),
    next: nextTopUp(settings, day),
    history: voucherHistory(settings, spends.rows, day),
  } : null), [settings, spends.rows, day])
  return { card, today: day, loading: spends.loading, error: spends.error, reload: spends.reload }
}
