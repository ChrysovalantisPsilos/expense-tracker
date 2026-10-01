// The bell's pure rules (NotificationBell, and the native app's bell): how
// many notifications are unread, what the badge says, and where tapping one
// goes.

// Notifications not read yet.
export function unreadCount(items) {
  return (items ?? []).filter((n) => !n.read_at).length
}

// The badge on the bell: the count, "9+" past nine, nothing at zero.
export function badgeText(unread) {
  if (!(unread > 0)) return null
  return unread > 9 ? '9+' : String(unread)
}

// The page a notification opens: the invites on Groups, Recurring for a
// charge reminder, Budgets, Home for the digest, else its group (or nowhere).
export function notificationPath(n) {
  if (n.type === 'invite') return '/groups'
  if (n.type === 'reminder') return '/recurring'
  if (n.type === 'budget') return '/budgets'
  if (n.type === 'digest') return '/'
  if (n.group_id) return `/groups/${n.group_id}`
  return null
}
