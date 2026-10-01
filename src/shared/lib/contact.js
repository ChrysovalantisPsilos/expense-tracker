// Where people reach Budgeer — one copy, shared with the edge functions' emails.
import { SUPPORT_EMAIL, PRIVACY_EMAIL } from '../../../supabase/functions/_shared/contact.ts'

export { SUPPORT_EMAIL, PRIVACY_EMAIL }

// The public status page (status/, a Cloudflare Worker): is Budgeer working
// right now? Hosted apart from the app, so it stays up when the app doesn't.
export const STATUS_URL = 'https://status.budgeer.com'

// All three at once, for the native app's Settings (through the mobile core).
export function contactLinks() {
  return { support: SUPPORT_EMAIL, privacy: PRIVACY_EMAIL, status: STATUS_URL }
}
