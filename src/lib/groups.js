import { supabase } from './supabase.js'

// ---- Queries -------------------------------------------------------------

export async function listGroups() {
  const { data, error } = await supabase
    .from('groups')
    .select('*, group_members(count)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

// Full detail for one group: members (+avatars), expenses (+splits), settlements.
export async function getGroup(groupId) {
  const [g, members, expenses, settlements] = await Promise.all([
    supabase.from('groups').select('*').eq('id', groupId).single(),
    supabase.from('group_members').select('*').eq('group_id', groupId).order('created_at'),
    supabase.from('group_expenses')
      .select('*, expense_splits(*)')
      .eq('group_id', groupId).order('spent_at', { ascending: false }),
    supabase.from('settlements').select('*').eq('group_id', groupId).order('settled_at', { ascending: false }),
  ])
  if (g.error) throw g.error

  // Merge co-members' avatars (profiles are readable for group co-members).
  const memberRows = members.data ?? []
  const userIds = memberRows.map((m) => m.user_id).filter(Boolean)
  let avatarByUser = {}
  if (userIds.length) {
    const { data: profs } = await supabase
      .from('profiles').select('id, avatar_url').in('id', userIds)
    avatarByUser = Object.fromEntries((profs ?? []).map((p) => [p.id, p.avatar_url]))
  }
  const withAvatars = memberRows.map((m) => ({ ...m, avatar_url: m.user_id ? avatarByUser[m.user_id] : null }))

  return {
    group: g.data,
    members: withAvatars,
    expenses: expenses.data ?? [],
    settlements: settlements.data ?? [],
  }
}

// ---- Mutations -----------------------------------------------------------

export async function createGroup(name, currency = 'EUR') {
  const { data, error } = await supabase.rpc('create_group', { p_name: name, p_currency: currency })
  if (error) throw error
  return data // group id
}

// Rename a group (owner only — enforced by RLS).
export async function renameGroup(groupId, name) {
  const { error } = await supabase.from('groups').update({ name }).eq('id', groupId)
  if (error) throw new Error(error.message)
}

// Equal split of amountMinor across memberIds, distributing the rounding
// remainder one cent at a time so shares sum EXACTLY to the total.
export function equalShares(amountMinor, memberIds) {
  const n = memberIds.length
  if (n === 0) return []
  const base = Math.floor(amountMinor / n)
  let remainder = amountMinor - base * n
  return memberIds.map((id) => {
    const extra = remainder > 0 ? 1 : 0
    remainder -= extra
    return { member_id: id, share_minor: base + extra }
  })
}

export async function addSharedExpense({
  groupId, description, amountMinor, currency, paidBy, spentAt, memberIds, receiptPath = null,
}) {
  const { data: exp, error } = await supabase
    .from('group_expenses')
    .insert({
      group_id: groupId, description: description || null, amount_minor: amountMinor,
      currency, paid_by: paidBy, spent_at: spentAt, receipt_path: receiptPath,
      created_by: (await supabase.auth.getUser()).data.user?.id,
    })
    .select().single()
  if (error) throw error
  const shares = equalShares(amountMinor, memberIds).map((s) => ({ ...s, expense_id: exp.id }))
  const { error: sErr } = await supabase.from('expense_splits').insert(shares)
  if (sErr) throw sErr
  return exp
}

export async function addSettlement({ groupId, fromMember, toMember, amountMinor, currency, settledAt }) {
  const { error } = await supabase.from('settlements').insert({
    group_id: groupId, from_member: fromMember, to_member: toMember,
    amount_minor: amountMinor, currency, settled_at: settledAt,
    created_by: (await supabase.auth.getUser()).data.user?.id,
  })
  if (error) throw error
}

// Create an invite for a group. Links self-expire (24h default set in the DB).
export async function createInvite(groupId, { email = null } = {}) {
  const { data, error } = await supabase
    .from('group_invites')
    .insert({
      group_id: groupId, invited_email: email,
      created_by: (await supabase.auth.getUser()).data.user?.id,
    })
    .select('token').single()
  if (error) throw error
  return { token: data.token, url: `${window.location.origin}/join/${data.token}` }
}

// Helper for the copy-link button.
export async function createInviteLink(groupId) {
  return (await createInvite(groupId)).url
}

// Email an invite link via the send-invite edge function. Surfaces a clear
// message when email is not configured (RESEND_API_KEY missing) so the caller
// can fall back to the share link.
export async function emailInvite({ to, url, groupName, inviterName }) {
  const { data, error } = await supabase.functions.invoke('send-invite', {
    body: { to, url, groupName, inviterName },
  })
  if (error) {
    let msg = error.message
    try { const j = await error.context?.json?.(); if (j?.error) msg = j.error } catch { /* ignore */ }
    throw new Error(msg)
  }
  return data
}

// Read-only look at a share link — never writes, so any number of people can
// open the same link. Shape: { status, group_id?, preview? } where status is
// 'joinable' | 'already_member' | 'invalid'.
export async function previewLinkInvite(token) {
  const { data, error } = await supabase.rpc('preview_link_invite', { p_token: token })
  if (error) throw new Error(error.message)
  return data
}

// Join a group via a share link. Idempotent, and leaves the link open for the
// next person. Returns the group id.
export async function joinViaLink(token) {
  const { data, error } = await supabase.rpc('join_via_link', { p_token: token })
  if (error) throw new Error(error.message)
  return data
}

// Read-only snapshot of a group from a share token — works logged-out (anon).
export async function previewGroup(token) {
  const { data, error } = await supabase.rpc('group_preview', { p_token: token })
  if (error) throw error
  return data // null if token invalid/expired
}

// Invite an EXISTING user by exact email (creates an in-app request). Throws
// with message 'no_account' when no user has that email (caller falls back to
// a phantom).
export async function inviteExistingUser(groupId, email) {
  const { error } = await supabase.rpc('invite_user_to_group', { p_group: groupId, p_email: email })
  if (error) throw new Error(error.message)
}

export async function listMyInvites() {
  const { data, error } = await supabase.rpc('list_my_group_invites')
  if (error) throw error
  return data ?? []
}

export async function respondToInvite(inviteId, accept) {
  const { data, error } = await supabase.rpc('respond_to_invite', { p_invite: inviteId, p_accept: accept })
  if (error) throw new Error(error.message)
  return data // group id when accepted
}

// Edit an existing shared expense (fields + equal re-split among memberIds).
export async function updateSharedExpense({
  expenseId, description, amountMinor, currency, paidBy, spentAt, memberIds,
}) {
  const { error } = await supabase.rpc('update_group_expense', {
    p_expense: expenseId, p_description: description || null, p_amount: amountMinor,
    p_currency: currency, p_paid_by: paidBy, p_spent_at: spentAt, p_member_ids: memberIds,
  })
  if (error) throw new Error(error.message)
}

export async function deleteSharedExpense(expenseId) {
  const { error } = await supabase.from('group_expenses').delete().eq('id', expenseId)
  if (error) throw new Error(error.message)
}

// Leave a group, or (as owner) remove another member. Server enforces the
// settled-up rule and owner auto-transfer. Returns the group id.
export async function removeMember(memberId) {
  const { data, error } = await supabase.rpc('remove_group_member', { p_member: memberId })
  if (error) throw new Error(friendlyRpcError(error))
  return data
}

export async function deleteGroup(groupId) {
  const { error } = await supabase.rpc('delete_group', { p_group: groupId })
  if (error) throw new Error(friendlyRpcError(error))
}

// Postgres RAISE messages come back on error.message; surface them directly.
function friendlyRpcError(error) {
  return error.message || 'Something went wrong'
}

// ---- Balances ------------------------------------------------------------

// Net balance per member: positive = the group owes them; negative = they owe.
//   net = paid − owed_shares + settled_out − settled_in
export function computeBalances({ members, expenses, settlements }) {
  const net = new Map(members.map((m) => [m.id, 0]))
  for (const e of expenses) {
    net.set(e.paid_by, (net.get(e.paid_by) ?? 0) + e.amount_minor)
    for (const s of e.expense_splits ?? []) {
      net.set(s.member_id, (net.get(s.member_id) ?? 0) - s.share_minor)
    }
  }
  for (const s of settlements) {
    net.set(s.from_member, (net.get(s.from_member) ?? 0) + s.amount_minor)
    net.set(s.to_member, (net.get(s.to_member) ?? 0) - s.amount_minor)
  }
  return net
}
