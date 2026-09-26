import { supabase } from '../../shared/lib/supabase.js'
import { useLiveQuery } from '../../shared/lib/db.js'
import { fileStem, saveBlob, toBlob } from '../../shared/lib/download.js'
import { FILE_TYPES } from '../../../supabase/functions/_shared/files.ts'
import { dbError, edgeFunctionError } from '../../shared/lib/errors.js'

// ---- Queries -------------------------------------------------------------

export async function listGroups() {
  const { data, error } = await supabase
    .from('groups')
    .select('*, group_members(count)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

// Attach avatar_url (from the group_member_avatars RPC rows) to member rows.
function withAvatars(members, avatars) {
  const byUser = Object.fromEntries((avatars ?? []).map((a) => [a.user_id, a.avatar_url]))
  return (members ?? []).map((m) => ({ ...m, avatar_url: m.user_id ? byUser[m.user_id] : null }))
}

// group_balances RPC rows → Map<memberId, net minor>.
const balanceMap = (rows) => new Map((rows ?? []).map((b) => [b.member_id, Number(b.net_minor)]))

// Full detail for one group: members (+avatars), expenses (+splits), settlements.
export async function getGroup(groupId) {
  const [g, members, ledger, avs, bal] = await Promise.all([
    supabase.from('groups').select('*').eq('id', groupId).single(),
    supabase.from('group_members').select('*').eq('group_id', groupId).order('created_at'),
    // Amounts/descriptions are encrypted at rest, so expenses (+ splits) and
    // settlements come from the decrypting, membership-checked group_ledger
    // RPC. Both newest first; same-day rows tie-break by when they were added.
    supabase.rpc('group_ledger', { p_group: groupId }),
    // Co-members' avatars (column-limited RPC) + server-computed balances.
    supabase.rpc('group_member_avatars', { p_group: groupId }),
    supabase.rpc('group_balances', { p_group: groupId }),
  ])
  if (g.error) throw g.error
  if (ledger.error) throw dbError(ledger.error)

  return {
    group: g.data,
    members: withAvatars(members.data, avs.data),
    expenses: ledger.data?.expenses ?? [],
    settlements: ledger.data?.settlements ?? [],
    balances: balanceMap(bal.data),
  }
}

// One group, live: getGroup's detail (plus the activity log with
// `activity`), refetched when anyone in the group adds or edits expenses,
// settles up, or joins or leaves — and caught up after reconnects and when the
// tab becomes visible again. The group page and its form pages all read it.
// Returns useLiveQuery's { data, loading, error, reload }; data is
// { group, members, expenses, settlements, balances, auditLog }.
export function useGroup(groupId, { activity = false } = {}) {
  return useLiveQuery(async () => {
    const [detail, auditLog] = await Promise.all([getGroup(groupId), activity ? listAuditLog(groupId) : []])
    return { ...detail, auditLog }
  }, {
    key: `group:${groupId}`,
    specs: [
      { table: 'group_expenses', filter: `group_id=eq.${groupId}` },
      { table: 'settlements', filter: `group_id=eq.${groupId}` },
      { table: 'group_members', filter: `group_id=eq.${groupId}` },
    ],
    deps: [groupId, activity],
  })
}

// The groups list's per-group extras, for the given group ids: each group's
// members (+avatars) and server-computed balances. One members query for all
// groups plus the two existing per-group RPCs, all in parallel. A group whose
// RPCs fail just comes back without that part. `balances: false` skips the
// balances RPCs (the Add form's group picker only needs the members).
// Map<groupId, { members: [...member, avatar_url], balances: Map<memberId, net> }>
export async function listGroupSummaries(groupIds, { balances = true } = {}) {
  if (!groupIds?.length) return new Map()
  const [members, ...perGroup] = await Promise.all([
    supabase.from('group_members').select('*').in('group_id', groupIds).order('created_at'),
    ...groupIds.map((id) => Promise.all([
      supabase.rpc('group_member_avatars', { p_group: id }),
      balances ? supabase.rpc('group_balances', { p_group: id }) : { data: null },
    ])),
  ])
  if (members.error) throw members.error
  return new Map(groupIds.map((id, i) => [id, {
    members: withAvatars((members.data ?? []).filter((m) => m.group_id === id), perGroup[i][0].data),
    balances: balanceMap(perGroup[i][1].data),
  }]))
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
  if (error) throw dbError(error)
}

// Upload/replace a group's cover image (owner only — enforced by storage RLS
// and the groups update policy). Returns the public URL.
export async function uploadGroupImage(groupId, file) {
  const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
  const path = `${groupId}/cover.${ext}`
  const { error } = await supabase.storage.from('group-images').upload(path, file, {
    contentType: file.type || 'image/jpeg', upsert: true,
  })
  if (error) throw dbError(error)
  const { data } = supabase.storage.from('group-images').getPublicUrl(path)
  const url = `${data.publicUrl}?t=${Date.now()}`
  const { error: uErr } = await supabase.from('groups').update({ image_url: url }).eq('id', groupId)
  if (uErr) throw dbError(uErr)
  return url
}

// Add a shared expense + its split in ONE transaction (RPC), so a failure can
// never leave an expense without splits. `amountMinor` is in `currency` (what
// was paid); a currency other than the group's needs `exchangeRate` (paid →
// group currency). Pass `shares` (GROUP-currency minor units aligned to
// memberIds, adding up to expenseGroupAmount) + `splitType` for an unequal
// split; omit them for an equal split (the server computes it via
// split_equally on the group amount, matching the edit path).
export async function addSharedExpense({
  groupId, description, amountMinor, currency, exchangeRate = null, paidBy, spentAt, memberIds,
  shares = null, splitType = 'equal',
}) {
  const { data, error } = await supabase.rpc('create_group_expense_v2', {
    p_group: groupId, p_description: description || null, p_amount: amountMinor,
    p_currency: currency, p_paid_by: paidBy, p_spent_at: spentAt,
    p_member_ids: memberIds, p_shares: shares, p_split_type: splitType,
    p_exchange_rate: exchangeRate,
  })
  if (error) throw dbError(error)
  return data // expense id
}

export async function addSettlement({ groupId, fromMember, toMember, amountMinor, currency, settledAt }) {
  // The amount is encrypted server-side by the add_settlement RPC. created_by
  // is set by the settlement_guard BEFORE INSERT trigger (authoritative, not
  // client-trusted), so we don't send it.
  const { error } = await supabase.rpc('add_settlement', {
    p_group: groupId, p_from: fromMember, p_to: toMember,
    p_amount: amountMinor, p_currency: currency, p_settled_at: settledAt ?? null,
  })
  if (error) throw error
}

// A co-member's saved payment details (IBAN/Revolut) for the settle-up
// shortcuts. profiles is own-row RLS, so this goes through a definer RPC that
// only answers for co-members of the given member's group. Returns {} if none.
export async function memberPaymentInfo(memberId) {
  const { data, error } = await supabase.rpc('member_payment_info', { p_member: memberId })
  if (error) throw dbError(error)
  return data ?? {}
}

// Create an invite for a group. created_by and the expiry (at most 24h) are
// forced server-side by a BEFORE INSERT trigger, so we don't send them.
export async function createInvite(groupId, { email = null } = {}) {
  const { data, error } = await supabase
    .from('group_invites')
    .insert({ group_id: groupId, invited_email: email })
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
  if (error) throw await edgeFunctionError(error)
  return data
}

// Read-only look at a share link — never writes, so any number of people can
// open the same link. Shape: { status, group_id?, preview? } where status is
// 'joinable' | 'already_member' | 'invalid'. `preview` is previewGroup's shape
// plus `members: [{ id, display_name, avatar_url }]` (no money).
export async function previewLinkInvite(token) {
  const { data, error } = await supabase.rpc('preview_link_invite', { p_token: token })
  if (error) throw dbError(error)
  return data
}

// Join a group via a share link. Idempotent, and leaves the link open for the
// next person. Returns the group id.
export async function joinViaLink(token) {
  const { data, error } = await supabase.rpc('join_via_link', { p_token: token })
  if (error) throw dbError(error)
  return data
}

// Minimal public snapshot of a group from a share token — works logged-out
// (anon). Shape: { group: { name, image_url }, member_count, invited_by,
// expires_at }, or null if the token is invalid/expired. No members, expenses
// or balances are exposed to a logged-out visitor.
export async function previewGroup(token) {
  const { data, error } = await supabase.rpc('group_preview', { p_token: token })
  if (error) throw error
  return data // null if token invalid/expired
}

// Invite an EXISTING user by exact email (creates an in-app request). Returns
// the server's status: 'invited' | 'no_account' (caller sends a link invite
// instead) | 'already_member' | 'already_invited'. Only real errors (not a
// member, rate limit) throw — a miss is a status so it still counts against
// the inviter's lookup quota.
export async function inviteExistingUser(groupId, email) {
  const { data, error } = await supabase.rpc('invite_user_to_group', { p_group: groupId, p_email: email })
  if (error) throw dbError(error)
  return data?.status
}

export async function listMyInvites() {
  const { data, error } = await supabase.rpc('list_my_group_invites')
  if (error) throw error
  return data ?? []
}

export async function respondToInvite(inviteId, accept) {
  const { data, error } = await supabase.rpc('respond_to_invite', { p_invite: inviteId, p_accept: accept })
  if (error) throw dbError(error)
  return data // group id when accepted
}

// Edit an existing shared expense (fields + re-split among memberIds), with
// the same currency/rate/shares rules as addSharedExpense.
export async function updateSharedExpense({
  expenseId, description, amountMinor, currency, exchangeRate = null, paidBy, spentAt, memberIds,
  shares = null, splitType = 'equal',
}) {
  const { error } = await supabase.rpc('update_group_expense_v2', {
    p_expense: expenseId, p_description: description || null, p_amount: amountMinor,
    p_currency: currency, p_paid_by: paidBy, p_spent_at: spentAt,
    p_member_ids: memberIds, p_shares: shares, p_split_type: splitType,
    p_exchange_rate: exchangeRate,
  })
  if (error) throw dbError(error)
}

export async function deleteSharedExpense(expenseId) {
  const { error } = await supabase.from('group_expenses').delete().eq('id', expenseId)
  if (error) throw dbError(error)
}

// Leave a group, or (as owner) remove another member. Server enforces the
// settled-up rule and owner auto-transfer. Returns the group id.
// `silent` (self-leave only) skips the "X left the group" notification.
export async function removeMember(memberId, silent = false) {
  // Its RAISE messages (e.g. "settle up first") are copy for the user.
  const { data, error } = await supabase.rpc('remove_group_member',
    { p_member: memberId, p_silent: silent })
  if (error) throw dbError(error)
  return data
}

// Rate-limited "please settle up" reminder to a co-member (server: 2/day/pair).
export async function nudgeMember(groupId, memberId) {
  const { error } = await supabase.rpc('nudge_member', { p_group: groupId, p_member: memberId })
  if (error) throw dbError(error)
}

export async function deleteGroup(groupId) {
  const { error } = await supabase.rpc('delete_group', { p_group: groupId })
  if (error) throw dbError(error)
}

// Immutable audit trail for a group (members can read; append-only server-side).
// Summaries/amounts are encrypted at rest; the RPC decrypts for members only.
async function listAuditLog(groupId, limit = 200) {
  const { data, error } = await supabase.rpc('group_audit_entries', { p_group: groupId, p_limit: limit })
  if (error) throw dbError(error)
  return data ?? []
}

// Generate the group PDF statement (balances + settlements + audit trail) and
// trigger a download. Returns nothing; throws on failure.
export async function downloadGroupReport(groupId, groupName = 'group') {
  const { data, error } = await supabase.functions.invoke('group-report', {
    body: { group_id: groupId },
  })
  if (error) throw await edgeFunctionError(error)
  saveBlob(toBlob(data, FILE_TYPES.pdf), `${fileStem(groupName, 'group')}-statement.pdf`)
}
