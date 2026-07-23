import { formatMoney } from '../../shared/lib/currency.js'

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
