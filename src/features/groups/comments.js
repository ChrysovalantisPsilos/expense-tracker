import { supabase } from '../../shared/lib/supabase.js'

// Comment bodies are encrypted at rest: reads go through the decrypting
// `group_comments_for` RPC, posts through `add_group_comment` (which checks
// you're posting as your own member row and rate-limits the fan-out).

// Comments on a group item (an expense or a settlement), oldest first.
// Rows: { id, body, created_at, author_member_id, author_id, author: { display_name } }.
export async function listComments(groupId, targetId) {
  const { data, error } = await supabase.rpc('group_comments_for', { p_group: groupId, p_target: targetId })
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function addComment({ groupId, targetType, targetId, authorMemberId, body }) {
  const { error } = await supabase.rpc('add_group_comment', {
    p_group: groupId, p_target_type: targetType, p_target_id: targetId,
    p_author_member: authorMemberId, p_body: body,
  })
  if (error) throw new Error(error.message)
}

export async function deleteComment(id) {
  const { error } = await supabase.from('group_comments').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// Map of target_id -> comment count for the whole group (drives the row badge).
export async function commentCounts(groupId) {
  const { data, error } = await supabase.rpc('group_comment_counts', { p_group: groupId })
  if (error) throw new Error(error.message)
  return new Map((data ?? []).map((r) => [r.target_id, Number(r.n)]))
}
