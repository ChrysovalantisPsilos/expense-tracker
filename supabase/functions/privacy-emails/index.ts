// GDPR service-notice sender — called by pg_cron through pg_net (0076):
//   { "mode": "queue" } every 5 minutes, only when something is due
//       (run_privacy_email_queue): the coalesced notices in
//       public.privacy_email_queue —
//         consent_change  the notification switches' final state, at most one
//                         email per user per 15 minutes;
//         data_export     "a copy of your data was downloaded", at most one
//                         per user per hour.
//   { "mode": "legal" } hourly, only when someone is due (run_legal_update_sweep):
//       one email per user per new Privacy Notice / Terms version, to those who
//       signed up before it and haven't accepted it yet; stamped per user
//       (mark_legal_update_emailed) only once Resend accepted it, so a user is
//       never emailed twice for the same version.
// verify_jwt is OFF; auth is the shared x-cron-secret checked against Vault,
// like send-reminders and purge-inactive. Bounded per run and paced for
// Resend's rate limit; anything left over goes on the next run.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { requireCronSecret } from '../_shared/cron.ts'
import { PRIVACY_EMAIL } from '../_shared/contact.ts'
import { appOrigin, eachPaced, noticeSender, sendEmail } from '../_shared/sendEmail.ts'
import { consentChangeEmail, dataExportEmail, legalUpdateEmail } from '../_shared/gdprEmails.ts'
import { LEGAL_VERSIONS, currentLegalChange } from '../_shared/legal.ts'

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const MAX_QUEUE = 60
const MAX_LEGAL = 100

interface QueueRow {
  user_id: string; kind: 'consent_change' | 'data_export'; email: string | null
  last_event_at: string; pending_events: number
  notify_digest: boolean; notify_email: boolean; notify_push: boolean
}
interface LegalRow {
  user_id: string; email: string; privacy_changed: boolean; terms_changed: boolean
  privacy_version: string; terms_version: string
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  const gate = await requireCronSecret(admin, req)
  if (gate instanceof Response) return gate
  const { mode } = await req.json().catch(() => ({}))

  const sender = noticeSender()
  if (!sender) return json({ skipped: 'RESEND_API_KEY not set' })
  const ctx = { origin: appOrigin(), privacyEmail: PRIVACY_EMAIL }

  if (mode === 'queue') {
    // Claiming leases the rows for 10 minutes, so an overlapping run skips them.
    const { data, error } = await admin.rpc('claim_privacy_emails', { p_limit: MAX_QUEUE })
    if (error) return json({ error: error.message }, 500)
    let sent = 0
    await eachPaced((data ?? []) as QueueRow[], async (r) => {
      let ok = false
      if (r.email) {
        const at = new Date(r.last_event_at)
        const mail = r.kind === 'consent_change'
          ? consentChangeEmail(ctx, { changedAt: at, switches: r })
          : dataExportEmail(ctx, { lastAt: at, count: Math.max(1, r.pending_events) })
        ok = (await sendEmail(sender, { to: r.email, ...mail })).ok
      }
      const { error: fErr } = await admin.rpc('finish_privacy_email', {
        p_user: r.user_id, p_kind: r.kind, p_event_at: r.last_event_at,
        p_events: r.pending_events, p_sent: ok,
      })
      if (fErr) console.error('finish_privacy_email', fErr)
      if (ok) sent += 1
    })
    return json({ claimed: data?.length ?? 0, sent })
  }

  if (mode === 'legal') {
    const change = currentLegalChange()
    const { data, error } = await admin.rpc('legal_update_recipients', { p_limit: MAX_LEGAL })
    if (error) return json({ error: error.message }, 500)
    const rows = (data ?? []) as LegalRow[]
    // This deployment's texts must describe the versions the database has in
    // force; otherwise send nothing (and nothing is stamped).
    if (rows.length && (!change || rows[0].privacy_version !== LEGAL_VERSIONS.privacy
        || rows[0].terms_version !== LEGAL_VERSIONS.terms)) {
      return json({ error: 'legal versions differ between the function and the database' }, 409)
    }
    let sent = 0
    await eachPaced(rows, async (r) => {
      const mail = legalUpdateEmail(ctx, { change: change!, privacy: r.privacy_changed, terms: r.terms_changed })
      if (!(await sendEmail(sender, { to: r.email, ...mail })).ok) return // retried next run
      const { error: mErr } = await admin.rpc('mark_legal_update_emailed',
        { p_user: r.user_id, p_privacy: r.privacy_version, p_terms: r.terms_version })
      if (mErr) console.error('mark_legal_update_emailed', mErr)
      else sent += 1
    })
    return json({ due: rows.length, sent })
  }

  return json({ error: 'mode must be "queue" or "legal"' }, 400)
})
