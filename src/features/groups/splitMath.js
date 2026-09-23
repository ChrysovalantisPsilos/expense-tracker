// Pure helpers for shared-expense splitting and debt simplification.
// All money is integer minor units.
import { toBaseMinor, toMinor, fromMinor } from '../../shared/lib/currency.js'
import { distributeByWeights } from '../../../supabase/functions/_shared/breakdown.ts'

// Largest-remainder apportionment and the settle-up plan live with the edge
// functions (the group report PDF plans payments like the app does).
export { distributeByWeights, simplifyDebts } from '../../../supabase/functions/_shared/breakdown.ts'

// What an expense counts for in its group: the amount in the GROUP currency's
// minor units, which is what the split must add up to. Lockstep with SQL
// public.group_expense_amount (0062): same currency → the amount itself;
// otherwise amount × rate (expense → group currency) with toBaseMinor's exact
// rounding. null when a foreign amount has no usable rate yet.
export function expenseGroupAmount(amountMinor, currency, rate, groupCurrency) {
  if (!currency || currency === groupCurrency) return amountMinor
  return Number(rate) > 0 ? toBaseMinor(amountMinor, rate, currency, groupCurrency) : null
}

// Split `total` equally across `count` people, giving the leftover cents to the
// earliest people (matches the SQL split_equally so preview == server).
export function splitEqually(total, count) {
  if (count <= 0) return []
  const base = Math.trunc(total / count)
  const rem = total - base * count
  return Array.from({ length: count }, (_, i) => base + (i < rem ? 1 : 0))
}

// Live preview of each included member's share (minor units, group currency)
// for a split mode — the form's preview of what add/update_shared_expense
// stores. `values` maps member id → the typed input: an amount ('exact'), a
// percentage ('percent') or a weight ('shares'); ignored for 'equal'.
// Returns { shares (aligned with memberIds), assigned, ok, wsum? } where `ok`
// means the split is complete and valid for saving.
export function computeSplit(mode, totalMinor, memberIds, values, currency) {
  if (memberIds.length === 0) return { shares: [], assigned: 0, ok: false }
  if (mode === 'equal') {
    return { shares: splitEqually(totalMinor, memberIds.length), assigned: totalMinor, ok: totalMinor > 0 }
  }
  if (mode === 'exact') {
    const shares = memberIds.map((id) => (values[id] ? toMinor(values[id], currency) : 0))
    const assigned = shares.reduce((a, b) => a + b, 0)
    return { shares, assigned, ok: totalMinor > 0 && assigned === totalMinor }
  }
  // percent / shares → weight-based
  const weights = memberIds.map((id) => Number(values[id]) || 0)
  const wsum = weights.reduce((a, b) => a + b, 0)
  const ok = totalMinor > 0 && wsum > 0 && (mode === 'shares' || Math.abs(wsum - 100) < 0.001)
  return { shares: distributeByWeights(totalMinor, weights), assigned: totalMinor, ok, wsum }
}

// The inverse for editing: per-member input values reconstructed from an
// expense's stored shares (always group-currency minor units, whatever
// currency it was paid in). Empty for 'equal'.
export function prefillSplitValues(expense, mode, groupCurrency) {
  const splits = expense?.expense_splits ?? []
  const total = expense?.group_amount_minor ?? expense?.amount_minor ?? 0
  const out = {}
  for (const s of splits) {
    if (mode === 'exact') out[s.member_id] = String(fromMinor(s.share_minor, groupCurrency))
    else if (mode === 'percent') out[s.member_id] = total ? String(Math.round((s.share_minor / total) * 1000) / 10) : ''
    else if (mode === 'shares') out[s.member_id] = String(s.share_minor)
  }
  return out
}
