import { simplifyDebts } from './splitMath.js'

// Display name for a member id within a group's member list. Falls back to an
// em dash for unknown/removed ids. (Members carry their own display_name, so
// this is a pure lookup — no user join needed.)
export function memberName(members, id) {
  return (members ?? []).find((m) => m.id === id)?.display_name ?? '—'
}

// Members in display order: you first, then the owner, then everyone else in
// join order (the list's existing order). Returns a new array.
export function sortMembers(members, myUserId) {
  const rank = (m) => (m.user_id === myUserId ? 0 : m.role === 'owner' ? 1 : 2)
  return (members ?? []).map((m, i) => [m, i])
    .sort(([a, i], [b, j]) => rank(a) - rank(b) || i - j)
    .map(([m]) => m)
}

// The header's avatar stack: the first `max` members to draw, and how many
// more sit behind a "+N" chip. { shown, overflow }
export function avatarStack(members, max = 4) {
  const list = members ?? []
  const cap = Math.max(0, max)
  return { shown: list.slice(0, cap), overflow: Math.max(0, list.length - cap) }
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

// A member's name as the viewer reads it: "You" for themselves.
export function viewerName(members, id, myMemberId) {
  return id === myMemberId ? 'You' : memberName(members, id)
}

// An expense row's payer line: "Paid by You" / "Paid by Anna".
export function paidByLabel(members, payerId, myMemberId) {
  return `Paid by ${viewerName(members, payerId, myMemberId)}`
}

// The group's total spend (the header's "Total"), in minor units of the
// group's currency: a foreign-currency expense counts with its converted
// group_amount_minor (from group_ledger). A foreign row without one is left
// out rather than summed as if it were the same money.
export function groupTotal(expenses, currency) {
  return (expenses ?? []).reduce((sum, e) => {
    if (!e.currency || e.currency === currency) return sum + Number(e.amount_minor || 0)
    return e.group_amount_minor != null ? sum + Number(e.group_amount_minor) : sum
  }, 0)
}

// Every member's net balance for the balance tiles, in display order (you
// first, labelled "You"; then the owner; then join order). A member with no
// balance row is settled (0). [{ id, label, net, mine }]
export function memberBalances(balances, members, myUserId) {
  return sortMembers(members, myUserId).map((m) => {
    const mine = m.user_id === myUserId
    return { id: m.id, label: mine ? 'You' : m.display_name, net: balances?.get(m.id) ?? 0, mine }
  })
}

// True when an expense is the default split: equal, and shared by exactly
// the group's current members. Its "split N ways" says nothing new, so the
// row can drop it on phones. Custom splits, and splits that leave someone
// out (or include a member who has since left), return false.
export function isEveryoneEqualSplit(expense, members) {
  if (expense?.split_type && expense.split_type !== 'equal') return false
  const split = new Set((expense?.expense_splits ?? []).map((s) => s.member_id))
  const current = (members ?? []).map((m) => m.id)
  return current.length > 0 && split.size === current.length && current.every((id) => split.has(id))
}

// The viewer's balance in one group, for the groups list: "You're owed"
// (positive) / "You owe" (negative) + the amount (minor, non-negative), or
// "Settled up" (muted, amount null). A viewer who isn't a member is settled.
// { label, amount, tone }
export function myGroupBalance(balances, members, myUserId) {
  const me = (members ?? []).find((m) => m.user_id === myUserId)
  const net = me ? (balances?.get(me.id) ?? 0) : 0
  if (net > 0) return { label: 'You’re owed', amount: net, tone: 'positive' }
  if (net < 0) return { label: 'You owe', amount: -net, tone: 'negative' }
  return { label: 'Settled up', amount: null, tone: 'muted' }
}

// The group's full settle-up plan (fewest payments, from simplifyDebts) with
// display names; the viewer shows as "You" and is flagged so it can be
// highlighted. `tone` colours the amount by direction for the viewer:
// 'positive' = you receive, 'negative' = you pay, 'default' = between others.
// [{ from, to, fromName, toName, amount, mine, tone }]
export function settlePlan(balances, members, myMemberId) {
  const toneOf = (t) => (t.to === myMemberId ? 'positive' : t.from === myMemberId ? 'negative' : 'default')
  return simplifyDebts(balances ?? new Map()).map((t) => ({
    ...t,
    fromName: viewerName(members, t.from, myMemberId),
    toName: viewerName(members, t.to, myMemberId),
    mine: t.from === myMemberId || t.to === myMemberId,
    tone: toneOf(t),
  }))
}

// The one line that matters most for the viewer, from settlePlan's output:
// the biggest payment they receive or make — "Sofia owes you" / "You owe
// Alex" plus its amount (minor). null when the viewer has nothing to settle.
// Ties go to money owed to you. { text, amount, tone }
export function balanceHighlight(plan) {
  const best = (plan ?? []).filter((t) => t.mine)
    .reduce((a, t) => (!a || t.amount > a.amount || (t.amount === a.amount && t.tone === 'positive') ? t : a), null)
  if (!best) return null
  return best.tone === 'positive'
    ? { text: `${best.fromName} owes you`, amount: best.amount, tone: 'positive' }
    : { text: `You owe ${best.toName}`, amount: best.amount, tone: 'negative' }
}

// The settle-up dialog's suggestions: the fewest-payments plan's transfers
// that involve the viewer, biggest first. (The viewer has one net balance,
// so all of them go the same way: all paid by you, or all paid to you.)
// Each carries the form values it fills in, from the viewer's side:
// direction 'out' (you pay `otherId`) or 'in' (they pay you), and the amount
// in minor units. The first one is what the dialog opens on.
// [{ from, to, amount, direction, otherId }]
export function mySettleSuggestions(balances, myMemberId) {
  if (!myMemberId) return []
  return simplifyDebts(balances ?? new Map())
    .filter((t) => t.from === myMemberId || t.to === myMemberId)
    .map((t) => ({
      ...t,
      direction: t.from === myMemberId ? 'out' : 'in',
      otherId: t.from === myMemberId ? t.to : t.from,
    }))
    .sort((a, b) => b.amount - a.amount)
}

// The "Share summary" text (WhatsApp, Messages…): the group's name and total,
// then who owes whom by name — never "You", since friends read it. Text only:
// no expense descriptions, notes or comments. `format(minor)` formats money in
// the group currency.
export function groupSummaryText({ name, total, balances, members, format }) {
  const plan = settlePlan(balances, members, null)
  const lines = [`${name}: ${format(total)} spent in total`, '']
  if (plan.length === 0) lines.push('Everyone is settled up.')
  else {
    lines.push(`To settle up (${pluralise(plan.length, 'payment')}):`)
    for (const t of plan) lines.push(`• ${t.fromName} owes ${t.toName} ${format(t.amount)}`)
  }
  lines.push('', 'Shared from Budgeer')
  return lines.join('\n')
}
