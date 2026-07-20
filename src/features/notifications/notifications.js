import { supabase } from '../../shared/lib/supabase.js'

export async function listNotifications(limit = 30) {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data ?? []
}

export async function markAllRead() {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .is('read_at', null)
  if (error) throw error
}
