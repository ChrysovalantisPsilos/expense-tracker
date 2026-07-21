import { supabase, edgeFunctionError } from '../../shared/lib/supabase.js'

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
  const [g, members, expenses, settlements, avs, bal] = await Promise.all([
    supabase.from('groups').select('*').eq('id', groupId).single(),
    supabase.from('group_members').select('*').eq('group_id', groupId).order('created_at'),
    // Newest first; spent_at is a bare date, so same-day rows tie-break by
    // when they were added (newest addition on top).
    supabase.from('group_expenses')
      .select('*, expense_splits(*)')
      .eq('group_id', groupId)
      .order('spent_at', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase.from('settlements').select('*').eq('group_id', groupId)
      .order('settled_at', { ascending: false })
      .order('created_at', { ascending: false }),
    // Co-members' avatars (column-limited RPC) + server-computed balances.
    supabase.rpc('group_member_avatars', { p_group: groupId }),
    supabase.rpc('group_balances', { p_group: groupId }),
  ])
  if (g.error) throw g.error

  const memberRows = members.data ?? []
  const avatarByUser = Object.fromEntries((avs.data ?? []).map((a) => [a.user_id, a.avatar_url]))
  const withAvatars = memberRows.map((m) => ({ ...m, avatar_url: m.user_id ? avatarByUser[m.user_id] : null }))
  const balances = new Map((bal.data ?? []).map((b) => [b.member_id, Number(b.net_minor)]))

  return {
    group: g.data,
    members: withAvatars,
    expenses: expenses.data ?? [],
    settlements: settlements.data ?? [],
    balances,
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

// Upload/replace a group's cover image (owner only — enforced by storage RLS
// and the groups update policy). Returns the public URL.
export async function uploadGroupImage(groupId, file) {
  const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
  const path = `${groupId}/cover.${ext}`
  const { error } = await supabase.storage.from('group-images').upload(path, file, {
    contentType: file.type || 'image/jpeg', upsert: true,
  })
  if (error) throw new Error(error.message)
  const { data } = supabase.storage.from('group-images').getPublicUrl(path)
  const url = `${data.publicUrl}?t=${Date.now()}`
  const { error: uErr } = await supabase.from('groups').update({ image_url: url }).eq('id', groupId)
  if (uErr) throw new Error(uErr.message)
  return url
}

// Add a shared expense + its split in ONE transaction (RPC), so a failure can
// never leave an expense without splits. Pass `shares` (minor units aligned to
// memberIds) + `splitType` for an unequal split; omit them for an equal split
// (the server computes it via split_equally, matching the edit path).
export async function addSharedExpense({
  groupId, description, amountMinor, currency, paidBy, spentAt, memberIds,
  shares = null, splitType = 'equal', receiptPath = null,
}) {
  const { data, error } = await supabase.rpc('create_group_expense_v2', {
    p_group: groupId, p_description: description || null, p_amount: amountMinor,
    p_currency: currency, p_paid_by: paidBy, p_spent_at: spentAt,
    p_member_ids: memberIds, p_shares: shares, p_split_type: splitType,
    p_receipt_path: receiptPath,
  })
  if (error) throw new Error(error.message)
  return data // expense id
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
// The edge function derives the group name, inviter, and URL server-side from
// the token + caller identity — we pass only the recipient and the token.
export async function emailInvite({ to, token }) {
  const { data, error } = await supabase.functions.invoke('send-invite', {
    body: { to, token },
  })
  if (error) throw new Error(await edgeFunctionError(error))
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

// Edit an existing shared expense (fields + re-split among memberIds). Pass
// `shares` + `splitType` for an unequal split; omit for an equal re-split.
export async function updateSharedExpense({
  expenseId, description, amountMinor, currency, paidBy, spentAt, memberIds,
  shares = null, splitType = 'equal',
}) {
  const { error } = await supabase.rpc('update_group_expense_v2', {
    p_expense: expenseId, p_description: description || null, p_amount: amountMinor,
    p_currency: currency, p_paid_by: paidBy, p_spent_at: spentAt,
    p_member_ids: memberIds, p_shares: shares, p_split_type: splitType,
  })
  if (error) throw new Error(error.message)
}

export async function deleteSharedExpense(expenseId) {
  const { error } = await supabase.from('group_expenses').delete().eq('id', expenseId)
  if (error) throw new Error(error.message)
}

// Leave a group, or (as owner) remove another member. Server enforces the
// settled-up rule and owner auto-transfer. Returns the group id.
// `silent` (self-leave only) skips the "X left the group" notification.
export async function removeMember(memberId, silent = false) {
  // Postgres RAISE messages surface on error.message directly.
  const { data, error } = await supabase.rpc('remove_group_member',
    { p_member: memberId, p_silent: silent })
  if (error) throw new Error(error.message || 'Something went wrong')
  return data
}

export async function deleteGroup(groupId) {
  const { error } = await supabase.rpc('delete_group', { p_group: groupId })
  if (error) throw new Error(error.message || 'Something went wrong')
}

// Immutable audit trail for a group (members can read; append-only server-side).
export async function listAuditLog(groupId, limit = 200) {
  const { data, error } = await supabase
    .from('group_audit_log')
    .select('id, actor_name, action, summary, amount_minor, currency, created_at')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return data ?? []
}

// Generate the group PDF statement (balances + settlements + audit trail) and
// trigger a download. Returns nothing; throws on failure.
export async function downloadGroupReport(groupId, groupName = 'group') {
  const { data, error } = await supabase.functions.invoke('group-report', {
    body: { group_id: groupId },
  })
  if (error) throw new Error(await edgeFunctionError(error))
  // data is a Blob (pdf). Trigger a download.
  const blob = data instanceof Blob ? data : new Blob([data], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${groupName.replace(/[^a-z0-9]+/gi, '-')}-statement.pdf`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
