// Inactive-account sweep — called daily by pg_cron (run_inactivity_sweep →
// pg_net, 0073). verify_jwt is OFF; auth is the shared x-cron-secret checked
// against Vault, like send-reminders.
//
// public.inactive_accounts() (service_role only) decides who is due:
//   warn   — 23 months without use: one generic email, then the warning is
//            stamped (mark_inactivity_warned). Stamped only if the email was
//            accepted by Resend, and deletion requires a stamp, so nobody is
//            deleted without having been warned.
//   delete — 24 months without use and warned ≥ 28 days ago: deleted exactly
//            as delete-account does (_shared/accountDeletion.ts), then a
//            confirmation goes to the address captured before the deletion.
// Both emails are GDPR service notices (_shared/gdprEmails.ts). Bounded per
// run and paced for Resend; anything left over is picked up the next day.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { requireCronSecret } from '../_shared/cron.ts'
import { PRIVACY_EMAIL } from '../_shared/contact.ts'
import { deleteAccount } from '../_shared/accountDeletion.ts'
import { inactiveAccountDeletedEmail, inactivityWarningEmail } from '../_shared/gdprEmails.ts'
import { deletionDate, formatDay } from '../_shared/inactivity.ts'
import { appOrigin, eachPaced, noticeSender, sendEmail } from '../_shared/sendEmail.ts'

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const MAX_WARN = 100
const MAX_DELETE = 25

interface Due { user_id: string; email: string | null; last_active: string; warned_at: string | null; action: string }

Deno.serve(async (req) => {
  const gate = await requireCronSecret(admin, req)
  if (gate instanceof Response) return gate

  const { data: due, error } = await admin.rpc('inactive_accounts')
  if (error) return new Response(error.message, { status: 500 })
  const rows = (due ?? []) as Due[]

  const sender = noticeSender()
  const ctx = { origin: appOrigin(), privacyEmail: PRIVACY_EMAIL }

  let warned = 0
  let deleted = 0
  let confirmed = 0
  const now = new Date()

  // No mail provider = no warnings = (by construction) no deletions.
  if (sender) {
    await eachPaced(rows.filter((x) => x.action === 'warn' && x.email).slice(0, MAX_WARN), async (r) => {
      const deleteOn = formatDay(deletionDate(new Date(r.last_active), now))
      const mail = inactivityWarningEmail(ctx, { deleteOn })
      // Not stamped on failure: retried tomorrow, and no deletion without it.
      if (!(await sendEmail(sender, { to: r.email!, ...mail })).ok) return
      const { error: mErr } = await admin.rpc('mark_inactivity_warned', { p_user: r.user_id })
      if (!mErr) warned += 1
    })
  }

  await eachPaced(rows.filter((x) => x.action === 'delete').slice(0, MAX_DELETE), async (r) => {
    try {
      await deleteAccount(admin, r.user_id)
      deleted += 1
    } catch (e) {
      console.error('purge-inactive delete error', e)
      return
    }
    if (sender && r.email) {
      const mail = inactiveAccountDeletedEmail(ctx, {
        deletedAt: new Date(), warnedAt: r.warned_at ? new Date(r.warned_at) : null,
      })
      if ((await sendEmail(sender, { to: r.email, ...mail })).ok) confirmed += 1
    }
  })

  return new Response(JSON.stringify({ due: rows.length, warned, deleted, confirmed }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
