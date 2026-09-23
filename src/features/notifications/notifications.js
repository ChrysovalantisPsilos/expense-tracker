import { supabase } from '../../shared/lib/supabase.js'
import { useLiveQuery } from '../../shared/lib/db.js'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'

// The signed-in user's notification feed, live: new ones appear instantly;
// reconnect/visibility catch up. Call it ONCE (the app shell) and hand the
// result to every bell — each call is its own realtime channel and refetch.
// Returns { items, error, reload, setItems } (setItems: optimistic edits).
export function useNotificationFeed() {
  const { user } = useAuth()
  const { data: items, error, reload, mutate: setItems } = useLiveQuery(() => listNotifications(), {
    key: 'bell',
    specs: [{ table: 'notifications', filter: `user_id=eq.${user.id}` }],
    deps: [user.id],
    initial: [],
  })
  return { items, error, reload, setItems }
}

async function listNotifications(limit = 30) {
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
