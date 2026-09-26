import { userMessage } from './errors.js'
import { t } from './i18n/i18n.js'

// Turn a failed write into a toast payload. Login is required, so writes go
// straight to Supabase with no offline queue — and when a write fails the
// cause is almost always that the browser is offline. Say that plainly instead
// of surfacing a cryptic "Failed to fetch"; otherwise show a message we wrote
// (userMessage), never the raw error, which goes to the console.
export function saveErrorToast(e, fallbackTitle = t('common:errors.notSaved')) {
  console.error(`[save] ${fallbackTitle}:`, e)
  if (!navigator.onLine) {
    return { title: t('common:errors.offlineSave.title'), description: t('common:errors.offlineSave.body'), status: 'error' }
  }
  return { title: fallbackTitle, description: userMessage(e), status: 'error' }
}
