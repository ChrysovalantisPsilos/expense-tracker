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
//            as delete-account does (_shared/accountDeletion.ts).
// Bounded per run; anything left over is picked up the next day.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { requireCronSecret } from '../_shared/cron.ts'
import { brandEmail } from '../_shared/email.ts'
import { deleteAccount } from '../_shared/accountDeletion.ts'
import { deletionDate, formatDay } from '../_shared/inactivity.ts'

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const MAX_WARN = 100
const MAX_DELETE = 25
const PRIVACY_INBOX = Deno.env.get('PRIVACY_INBOX') || 'privacy@budgeer.com'

// Generic by design: no amounts, names or anything else from the account.
function warningEmail(opts: { origin: string; deleteOn: string }) {
  return brandEmail({
    origin: opts.origin,
    heading: 'Your Budgeer account will be deleted soon',
    paragraphs: [
      'Your Budgeer account hasn’t been used for almost two years. To avoid keeping personal data longer than needed, we delete accounts after two years without use.',
      `To keep your account, just sign in before ${opts.deleteOn}. If you do nothing, your account and its data will be deleted on or shortly after that date. You can download a copy of your data from Settings → Privacy first.`,
    ],
    cta: { label: 'Sign in to Budgeer', url: `${opts.origin}/login` },
    footer: [`Questions? ${PRIVACY_INBOX}`],
  })
}

Deno.serve(async (req) => {
  const gate = await requireCronSecret(admin, req)
  if (gate instanceof Response) return gate

  const { data: due, error } = await admin.rpc('inactive_accounts')
  if (error) return new Response(error.message, { status: 500 })
  const rows = (due ?? []) as { user_id: string; email: string | null; last_active: string; action: string }[]

  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
  const FROM = Deno.env.get('INVITE_FROM') || 'Budgeer <onboarding@resend.dev>'
  const APP_ORIGIN = (Deno.env.get('APP_ORIGIN') || 'https://budgeer.com').replace(/\/+$/, '')

  let warned = 0
  let deleted = 0
  const now = new Date()

  // No mail provider = no warnings = (by construction) no deletions.
  if (RESEND_API_KEY) {
    for (const r of rows.filter((x) => x.action === 'warn' && x.email).slice(0, MAX_WARN)) {
      const deleteOn = formatDay(deletionDate(new Date(r.last_active), now))
      const { html, text } = warningEmail({ origin: APP_ORIGIN, deleteOn })
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: FROM, to: [r.email], subject: 'Your Budgeer account will be deleted soon', html, text,
        }),
      })
      if (!res.ok) {
        console.error('resend error', res.status, await res.text().catch(() => ''))
        continue // not stamped: retried tomorrow, and no deletion without it
      }
      const { error: mErr } = await admin.rpc('mark_inactivity_warned', { p_user: r.user_id })
      if (!mErr) warned += 1
    }
  }

  for (const r of rows.filter((x) => x.action === 'delete').slice(0, MAX_DELETE)) {
    try {
      await deleteAccount(admin, r.user_id)
      deleted += 1
    } catch (e) {
      console.error('purge-inactive delete error', e)
    }
  }

  return new Response(JSON.stringify({ due: rows.length, warned, deleted }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
