import { supabase } from '../../shared/lib/supabase.js'

// Comments on a group item (an expense or a settlement), oldest first.
export async function listComments(groupId, targetId) {
  const { data, error } = await supabase
    .from('group_comments')
    .select('id, body, created_at, author_member_id, author_id, author:group_members(display_name)')
    .eq('group_id', groupId)
    .eq('target_id', targetId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function addComment({ groupId, targetType, targetId, authorMemberId, body }) {
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase.from('group_comments').insert({
    group_id: groupId, target_type: targetType, target_id: targetId,
    author_member_id: authorMemberId, author_id: user?.id, body,
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
