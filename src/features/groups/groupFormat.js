import { formatMoney } from '../../shared/lib/currency.js'
import { simplifyDebts } from './splitMath.js'

// Display name for a member id within a group's member list. Falls back to an
// em dash for unknown/removed ids. (Members carry their own display_name, so
// this is a pure lookup — no user join needed.)
export function memberName(members, id) {
  return (members ?? []).find((m) => m.id === id)?.display_name ?? '—'
}

// Short balance phrasing for a member's net (positive = is owed, negative =
// owes, zero = settled up). Returns just the text; callers pick the color.
export function describeBalance(net, currency) {
  if (net > 0) return `owed ${formatMoney(net, currency)}`
  if (net < 0) return `owes ${formatMoney(-net, currency)}`
  return 'settled up'
}

// "1 member" / "3 members". `plural` covers irregular words (person/people).
export function pluralise(n, singular, plural = `${singular}s`) {
  return `${n} ${n === 1 ? singular : plural}`
}

// How an expense is split, for its row: "split 3 ways", or "custom split ·
// 2 people" for exact/percentage/shares splits.
export function splitLabel(expense) {
  const n = expense?.expense_splits?.length ?? 0
  return expense?.split_type && expense.split_type !== 'equal'
    ? `custom split · ${pluralise(n, 'person', 'people')}`
    : `split ${pluralise(n, 'way')}`
}

// The group's full settle-up plan (fewest payments, from simplifyDebts) with
// display names; the viewer shows as "You" and is flagged so it can be
// highlighted. [{ from, to, fromName, toName, amount, mine }]
export function settlePlan(balances, members, myMemberId) {
  const name = (id) => (id === myMemberId ? 'You' : memberName(members, id))
  return simplifyDebts(balances ?? new Map()).map((t) => ({
    ...t,
    fromName: name(t.from),
    toName: name(t.to),
    mine: t.from === myMemberId || t.to === myMemberId,
  }))
}
