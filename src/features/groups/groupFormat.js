import { simplifyDebts } from './splitMath.js'
import { t } from '../../shared/lib/i18n/i18n.js'
import { formatMoney } from '../../shared/lib/currency.js'
import { shortDate, shortDateTime } from '../../shared/lib/dates.js'
import { signedAmount } from '../../shared/ui/kit/kitMath.js'
import { avatarLook } from '../../shared/ui/avatarLook.js'

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

// Can the viewer delete this group? Only the owner, and only once nobody else
// is still in it: every member linked to another account has to leave (or be
// removed) first. A row with no account is someone who already left (or
// deleted their account) and is kept only for the group's history, so it
// doesn't count. Mirrors delete_group (0088), which stays the authority.
// { canDelete, others } — `others` are the members still in the way.
export function groupDeleteCheck(group, members, myUserId) {
  const others = (members ?? []).filter((m) => m.user_id && m.user_id !== myUserId)
  return { canDelete: !!myUserId && group?.owner_id === myUserId && others.length === 0, others }
}

// The header's avatar stack: the first `max` members to draw, and how many
// more sit behind a "+N" chip. { shown, overflow }
export function avatarStack(members, max = 4) {
  const list = members ?? []
  const cap = Math.max(0, max)
  return { shown: list.slice(0, cap), overflow: Math.max(0, list.length - cap) }
}

// "1 member" / "3 members", in the app's language: `noun` is one of
// groups:count's words (member, payment, person, way).
export function pluralise(n, noun) {
  return t(`groups:count.${noun}`, { count: n })
}

// How an expense is split, for its row: "split 3 ways", or "custom split ·
// 2 people" for exact/percentage/shares splits.
export function splitLabel(expense) {
  const n = expense?.expense_splits?.length ?? 0
  return expense?.split_type && expense.split_type !== 'equal'
    ? t('groups:format.splitCustom', { people: pluralise(n, 'person') })
    : t('groups:format.splitEqual', { ways: pluralise(n, 'way') })
}

// A member's name as the viewer reads it: "You" for themselves.
export function viewerName(members, id, myMemberId) {
  return id === myMemberId ? t('groups:you') : memberName(members, id)
}

// The name an expense goes by in its row and its comments' page.
export function expenseLabel(expense) {
  return expense?.description || t('groups:expense')
}

// A settlement's name, from the viewer's side: "You → Sam".
export function settlementLabel(settlement, members, myMemberId) {
  const who = (id) => viewerName(members, id, myMemberId)
  return `${who(settlement.from_member)} → ${who(settlement.to_member)}`
}

// The item a comments page is about, found in the group's ledger by id: an
// expense or a settlement, as { type, id, label } (add_group_comment's target
// type and id, and the page's subtitle). null when it isn't in the group (a
// deleted item, a mistyped link).
export function commentTarget({ expenses, settlements, members }, itemId, myMemberId) {
  const e = (expenses ?? []).find((x) => x.id === itemId)
  if (e) return { type: 'expense', id: e.id, label: expenseLabel(e) }
  const s = (settlements ?? []).find((x) => x.id === itemId)
  if (s) return { type: 'settlement', id: s.id, label: settlementLabel(s, members, myMemberId) }
  return null
}

// An expense row's payer line: "Paid by You" / "Paid by Anna".
export function paidByLabel(members, payerId, myMemberId) {
  return payerId === myMemberId
    ? t('groups:format.paidByYou')
    : t('groups:format.paidBy', { name: memberName(members, payerId) })
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
    return { id: m.id, label: mine ? t('groups:you') : m.display_name, net: balances?.get(m.id) ?? 0, mine }
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
  if (net > 0) return { label: t('groups:format.balance.owed'), amount: net, tone: 'positive' }
  if (net < 0) return { label: t('groups:format.balance.owe'), amount: -net, tone: 'negative' }
  return { label: t('groups:format.balance.settled'), amount: null, tone: 'muted' }
}

// The group's full settle-up plan (fewest payments, from simplifyDebts) with
// display names; the viewer shows as "You" and is flagged so it can be
// highlighted. `tone` colours the amount by direction for the viewer:
// 'positive' = you receive, 'negative' = you pay, 'default' = between others.
// [{ from, to, fromName, toName, amount, mine, tone }]
export function settlePlan(balances, members, myMemberId) {
  const toneOf = (x) => (x.to === myMemberId ? 'positive' : x.from === myMemberId ? 'negative' : 'default')
  return simplifyDebts(balances ?? new Map()).map((x) => ({
    ...x,
    fromName: viewerName(members, x.from, myMemberId),
    toName: viewerName(members, x.to, myMemberId),
    mine: x.from === myMemberId || x.to === myMemberId,
    tone: toneOf(x),
  }))
}

// The viewer's side of settlePlan's output in one line, with the total
// (minor): "Sofia owes you" / "You owe Alex" for one payment, "2 people owe
// you" / "You owe 2 people" for several. The viewer has one net balance, so
// their payments all go one way; should both ways appear, the bigger total
// wins (a tie goes to money owed to you). null when the viewer has nothing
// to settle. { text, amount, tone }
export function balanceHighlight(plan) {
  const mine = (plan ?? []).filter((x) => x.mine)
  const total = (xs) => xs.reduce((n, x) => n + x.amount, 0)
  const owed = mine.filter((x) => x.tone === 'positive')
  const owing = mine.filter((x) => x.tone !== 'positive')
  if (!mine.length) return null
  if (owed.length && total(owed) >= total(owing)) {
    return {
      text: owed.length === 1
        ? t('groups:format.owesYou', { name: owed[0].fromName })
        : t('groups:format.peopleOweYou', { people: pluralise(owed.length, 'person') }),
      amount: total(owed),
      tone: 'positive',
    }
  }
  return {
    text: owing.length === 1
      ? t('groups:format.youOwe', { name: owing[0].toName })
      : t('groups:format.youOwePeople', { people: pluralise(owing.length, 'person') }),
    amount: total(owing),
    tone: 'negative',
  }
}

// The settle-up page's suggestions: the fewest-payments plan's transfers
// that involve the viewer, biggest first. (The viewer has one net balance,
// so all of them go the same way: all paid by you, or all paid to you.)
// Each carries the form values it fills in, from the viewer's side:
// direction 'out' (you pay `otherId`) or 'in' (they pay you), and the amount
// in minor units. The first one is what the page opens on.
// [{ from, to, amount, direction, otherId }]
export function mySettleSuggestions(balances, myMemberId) {
  if (!myMemberId) return []
  return simplifyDebts(balances ?? new Map())
    .filter((x) => x.from === myMemberId || x.to === myMemberId)
    .map((x) => ({
      ...x,
      direction: x.from === myMemberId ? 'out' : 'in',
      otherId: x.from === myMemberId ? x.to : x.from,
    }))
    .sort((a, b) => b.amount - a.amount)
}

// The "Share summary" text (WhatsApp, Messages…): the group's name and total,
// then who owes whom by name — never "You", since friends read it. Text only:
// no expense descriptions, notes or comments. `format(minor)` formats money in
// the group currency. In the app's language, like the rest of the page.
export function groupSummaryText({ name, total, balances, members, format }) {
  const plan = settlePlan(balances, members, null)
  const lines = [t('groups:format.summary.total', { name, total: format(total) }), '']
  if (plan.length === 0) lines.push(t('groups:format.summary.settled'))
  else {
    lines.push(t('groups:format.summary.toSettle', { payments: pluralise(plan.length, 'payment') }))
    for (const p of plan) {
      lines.push(t('groups:format.summary.line', { from: p.fromName, to: p.toName, amount: format(p.amount) }))
    }
  }
  lines.push('', t('groups:format.summary.footer'))
  return lines.join('\n')
}

// The "Share summary" text for a group's page: groupSummaryText with the
// group's total, its amounts in the group's currency.
export function groupShareText({ group, expenses, balances, members }) {
  const format = (minor) => formatMoney(minor, group.currency)
  return groupSummaryText({
    name: group.name, total: groupTotal(expenses, group.currency), balances, members, format,
  })
}

// An invite on the groups list (list_my_group_invites' row): the group and
// who invited you.
export const inviteRowParts = (inv) => ({
  id: inv.invite_id, name: inv.group_name, text: t('groups:list.invitedYou', { name: inv.invited_by }),
})

// ---- The rows the server sends, as the pages read them ---------------------

// group_balances rows → Map<memberId, net minor>.
export const balancesFrom = (rows) => new Map((rows ?? []).map((b) => [b.member_id, Number(b.net_minor)]))

// group_comment_counts rows → Map<targetId, count> (a row's comment badge).
export const commentCountsFrom = (rows) => new Map((rows ?? []).map((r) => [r.target_id, Number(r.n)]))

// Member rows with their avatar_url, from the group_member_avatars RPC's rows
// (co-members' pictures come through that column-limited RPC).
export function membersWithAvatars(members, avatars) {
  const byUser = Object.fromEntries((avatars ?? []).map((a) => [a.user_id, a.avatar_url]))
  return (members ?? []).map((m) => ({ ...m, avatar_url: m.user_id ? byUser[m.user_id] : null }))
}

// The join link an invite's token opens, on the site at `origin`.
export const inviteLink = (origin, token) => `${origin}/join/${token}`

// Who is looking at a group: their member row (null when they aren't in it,
// e.g. while an invite is open) and whether they own it.
export function groupViewer(group, members, myUserId) {
  return {
    myMember: (members ?? []).find((m) => m.user_id === myUserId) ?? null,
    isOwner: !!myUserId && group?.owner_id === myUserId,
  }
}

// ---- What the pages show (the web's components and the native app's) -----

// A member's avatar: the look of their circle (avatarLook), `highlight` for
// the viewer.
export const memberAvatar = (m, highlight) => ({ id: m.id, ...avatarLook(m.display_name, { src: m.avatar_url, highlight }) })

// The avatar stack (AvatarStack): you and the owner first, four at most, and
// the "+N" past them. { shown: [memberAvatar], overflow }
export function avatarStackParts(members, myUserId, max = 4) {
  const { shown, overflow } = avatarStack(sortMembers(members, myUserId), max)
  return { shown: shown.map((m) => memberAvatar(m, m.user_id === myUserId)), overflow }
}

// A group's card on the groups list: its name and photo, "4 members", its
// currency, the avatar stack and the viewer's balance in it ("You're owed"
// and the amount, in its tone). Without its summary (listGroupSummaries'
// members and balances, which may fail on their own) the count comes from
// the groups query and there's no stack or balance.
export function groupCardParts(group, summary, myUserId) {
  const count = summary?.members.length ?? group.group_members?.[0]?.count ?? 0
  const bal = summary ? myGroupBalance(summary.balances, summary.members, myUserId) : null
  return {
    id: group.id,
    name: group.name,
    imageUrl: group.image_url ?? null,
    members: pluralise(count, 'member'),
    currency: group.currency,
    avatars: summary ? avatarStackParts(summary.members, myUserId) : null,
    balance: bal && {
      label: bal.label,
      amount: bal.amount != null ? formatMoney(bal.amount, group.currency) : null,
      tone: bal.tone,
    },
  }
}

// The group page's balances card and "Who owes whom" (GroupBalances): your
// balance, everyone's net (when there's more than you), the line that
// matters most to you (or "You're all settled up") and the settle-up plan,
// each payment with both people's avatars. Amounts are formatted in the
// group's currency; tones are kitMath's.
export function balancesParts({ balances, members, myMember, myUserId, currency }) {
  const money = (minor) => formatMoney(minor, currency)
  const plan = settlePlan(balances, members, myMember?.id)
  const highlight = balanceHighlight(plan)
  const nets = memberBalances(balances, members, myUserId)
  const person = (id, name) => {
    const m = (members ?? []).find((x) => x.id === id)
    return { id, ...avatarLook(name, { src: m?.avatar_url, highlight: id === myMember?.id }) }
  }
  return {
    mine: signedAmount(myMember ? (balances?.get(myMember.id) ?? 0) : 0, money),
    tiles: nets.length > 1 ? nets.map((b) => ({ id: b.id, label: b.label, ...signedAmount(b.net, money) })) : [],
    highlight: highlight
      ? { text: highlight.text, amount: money(highlight.amount), tone: highlight.tone }
      : { text: t('groups:balances.allSettled'), amount: null, tone: null },
    plan: plan.map((p) => ({
      key: `${p.from}-${p.to}`, amount: money(p.amount), tone: p.tone,
      from: person(p.from, p.fromName), to: person(p.to, p.toName),
    })),
    planSubtitle: plan.length ? t('groups:balances.plan', { payments: pluralise(plan.length, 'payment') }) : null,
  }
}

// An expense's row in the group's history: its name, the muted line's parts
// ("Paid by You", the date, "split 4 ways" — `phone: false` for a part the
// narrowest screens leave out), the amount as paid, a foreign amount's value
// in the group currency ("≈ €21.15"), its comment count, and whether the
// viewer may edit it (whoever added it, or the owner).
export function expenseRowParts(e, { members, myMemberId, myUserId, isOwner, currency, counts, now }) {
  return {
    id: e.id,
    title: expenseLabel(e),
    meta: [
      { text: paidByLabel(members, e.paid_by, myMemberId), phone: true },
      { text: shortDate(e.spent_at, now), phone: true },
      { text: splitLabel(e), phone: !isEveryoneEqualSplit(e, members) },
    ],
    amount: formatMoney(e.amount_minor, e.currency),
    amountMeta: e.currency !== currency && e.group_amount_minor != null
      ? `≈ ${formatMoney(e.group_amount_minor, currency)}` : null,
    comments: counts?.get(e.id) ?? 0,
    canEdit: e.created_by === myUserId || !!isOwner,
  }
}

// A settlement's row: "You → Sam", its date, the amount, its comment count.
export function settlementRowParts(s, { members, myMemberId, counts, now }) {
  return {
    id: s.id,
    title: settlementLabel(s, members, myMemberId),
    meta: shortDate(s.settled_at, now),
    amount: formatMoney(s.amount_minor, s.currency),
    comments: counts?.get(s.id) ?? 0,
  }
}

// How many of the activity log's entries the history shows.
const ACTIVITY_SHOWN = 25

// The Activity tab's rows (the newest 25): the summary, when, and the
// amount when the entry has one (in its currency, else the group's).
export function activityParts(auditLog, currency, now) {
  return (auditLog ?? []).slice(0, ACTIVITY_SHOWN).map((a) => ({
    id: a.id,
    text: a.summary,
    when: shortDateTime(a.created_at, now),
    amount: a.amount_minor != null ? formatMoney(a.amount_minor, a.currency || currency) : null,
  }))
}

// The Members page's rows: you and the owner first, "Sam (you)", the
// owner's badge, and whether the viewer (the owner) may remove them.
export function memberRowParts(members, myUserId, isOwner) {
  return sortMembers(members, myUserId).map((m) => {
    const isMe = m.user_id === myUserId
    return {
      ...memberAvatar(m, isMe),
      label: isMe ? t('groups:members.me', { name: m.display_name }) : m.display_name,
      isMe,
      owner: m.role === 'owner' ? t('groups:members.owner') : null,
      canRemove: !!isOwner && !isMe,
      removeLabel: t('groups:members.remove', { name: m.display_name }),
    }
  })
}

// What an email invite's answer from invite_user_to_group says when it
// isn't sent ('invited' and 'no_account' carry on): already in the group,
// already invited, or it couldn't be sent.
const INVITE_REFUSED = {
  already_member: 'groups:members.status.alreadyMember',
  already_invited: 'groups:members.status.alreadyInvited',
}
export const inviteRefusal = (status) => t(INVITE_REFUSED[status] ?? 'groups:members.sendFailed')

// The delete dialog's type-to-confirm: the group's name, typed exactly.
export const deleteNameMatches = (typed, name) => String(typed ?? '').trim() === name

// Who is still in the way of deleting the group (groupDeleteCheck's
// `others`), as the blocked dialog names them: "Anna, Sam".
export const stillInNames = (others) => (others ?? []).map((m) => m.display_name).join(', ')

// A comment in a thread: who wrote it (and their avatar), when, the text,
// and whether the viewer may delete it (their own).
export function commentParts(cm, myUserId, now) {
  return {
    id: cm.id,
    ...avatarLook(cm.author?.display_name),
    author: cm.author?.display_name || t('groups:member'),
    when: shortDateTime(cm.created_at, now),
    body: cm.body,
    canDelete: !!myUserId && cm.author_id === myUserId,
  }
}
