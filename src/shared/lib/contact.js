// Where people reach Budgeer — one copy, shared with the edge functions' emails.
export { SUPPORT_EMAIL, PRIVACY_EMAIL } from '../../../supabase/functions/_shared/contact.ts'

// The public status page (status/, a Cloudflare Worker): is Budgeer working
// right now? Hosted apart from the app, so it stays up when the app doesn't.
export const STATUS_URL = 'https://status.budgeer.com'
