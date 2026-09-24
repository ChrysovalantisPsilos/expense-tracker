// The operator's daily sign-up digest — called by pg_cron through pg_net
// (run_operator_digest, 0079) at 06:00 UTC, only when yesterday had a sign-up.
// verify_jwt is OFF; auth is the shared x-cron-secret checked against Vault,
// like privacy-emails and purge-inactive.
//
// A count only ("N new sign-ups yesterday · M accounts in total"): no
// addresses, names or ids. The recipient is the Vault secret
// operator_signup_email; without it (TEST) the function does nothing. Each
// UTC day is claimed in operator_digest_log before sending, so it is emailed
// at most once; a failed send releases the day for a rerun.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { requireCronSecret } from '../_shared/cron.ts'
import { appOrigin, operatorSender, sendEmail } from '../_shared/sendEmail.ts'
import { signupDigestEmail } from '../_shared/operatorDigest.ts'

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  const gate = await requireCronSecret(admin, req)
  if (gate instanceof Response) return gate

  const { data: to, error: toErr } = await admin.rpc('operator_signup_email')
  if (toErr) return json({ error: toErr.message }, 500)
  if (!to) return json({ skipped: 'operator_signup_email not set in Vault' })
  const sender = operatorSender()
  if (!sender) return json({ skipped: 'RESEND_API_KEY not set' })

  const { data: d, error } = await admin.rpc('signup_digest')
  if (error) return json({ error: error.message }, 500)
  if (d.sent) return json({ skipped: 'already sent', day: d.day })
  if (d.new_count < 1) return json({ skipped: 'no new sign-ups', day: d.day })

  const { data: claimed, error: cErr } = await admin.rpc('claim_operator_digest', { p_day: d.day })
  if (cErr) return json({ error: cErr.message }, 500)
  if (!claimed) return json({ skipped: 'already sent', day: d.day })

  const mail = signupDigestEmail(appOrigin(), { day: d.day, newCount: d.new_count, total: d.total })
  if (!(await sendEmail(sender, { to, ...mail })).ok) {
    const { error: rErr } = await admin.rpc('release_operator_digest', { p_day: d.day })
    if (rErr) console.error('release_operator_digest', rErr)
    return json({ error: 'send failed', day: d.day }, 502)
  }
  return json({ sent: true, day: d.day, new_count: d.new_count })
})
