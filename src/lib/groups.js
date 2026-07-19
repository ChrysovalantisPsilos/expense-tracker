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

// Full detail for one group: members, expenses (+splits), settlements.
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
  return {
    group: g.data,
    members: members.data ?? [],
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

export async function addMember(groupId, displayName) {
  const { data, error } = await supabase
    .from('group_members')
    .insert({ group_id: groupId, display_name: displayName })
    .select().single()
  if (error) throw error
  return data
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

export async function createInvite(groupId, { memberId = null, email = null } = {}) {
  const { data, error } = await supabase
    .from('group_invites')
    .insert({
      group_id: groupId, member_id: memberId, invited_email: email,
      created_by: (await supabase.auth.getUser()).data.user?.id,
    })
    .select('token').single()
  if (error) throw error
  return { token: data.token, url: `${window.location.origin}/join/${data.token}` }
}

// Back-compat helper for the copy-link buttons.
export async function createInviteLink(groupId, memberId = null) {
  return (await createInvite(groupId, { memberId })).url
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

export async function acceptInvite(token) {
  const { data, error } = await supabase.rpc('accept_group_invite', { p_token: token })
  if (error) throw error
  return data // group id
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
