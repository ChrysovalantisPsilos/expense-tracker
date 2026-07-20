// Turn a failed write into a toast payload. Login is required, so writes go
// straight to Supabase with no offline queue — and when a write fails the
// cause is almost always that the browser is offline. Say that plainly instead
// of surfacing a cryptic "Failed to fetch"; otherwise show the server message.
export function saveErrorToast(e, fallbackTitle = 'Couldn’t save') {
  if (!navigator.onLine) {
    return { title: 'You’re offline', description: 'Reconnect to save your changes.', status: 'error' }
  }
  return { title: fallbackTitle, description: e?.message, status: 'error' }
}
