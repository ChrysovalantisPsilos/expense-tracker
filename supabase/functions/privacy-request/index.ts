// Edge Function: privacy-request
// The Settings → Privacy request form (restriction, objection, or any other
// data-protection request). Forwards the signed-in user's request to the
// privacy inbox through the existing email processor (Resend) — nowhere else —
// with Reply-To set to the account's own address, so the answer goes to the
// verified email on file, not to anything typed in the form.
//
// verify_jwt = true. Rate-limited to 3 requests a day per user (consume_quota
// 'privacy-request', 0074). Nothing is stored: the email is the record.

import { withCors, json, callerClient } from '../_shared/http.ts'
import { brandEmail } from '../_shared/email.ts'
import { REQUEST_KINDS, validatePrivacyRequest } from '../_shared/privacyRequest.ts'

Deno.serve(withCors(async (req) => {
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
  const FROM = Deno.env.get('INVITE_FROM') || 'Budgeer <onboarding@resend.dev>'
  const INBOX = Deno.env.get('PRIVACY_INBOX') || 'privacy@budgeer.com'

  try {
    const asUser = callerClient(req)
    const { data: { user } } = await asUser.auth.getUser()
    if (!user?.email) return json({ error: 'not authenticated' }, 401)

    const parsed = validatePrivacyRequest(await req.json().catch(() => ({})))
    if ('error' in parsed) return json({ error: parsed.error }, 400)

    if (!RESEND_API_KEY) {
      return json({ error: `The form isn’t available right now — please email ${INBOX}.` }, 503)
    }
    const { data: allowed, error: quotaErr } = await asUser.rpc('consume_quota', { p_scope: 'privacy-request' })
    if (quotaErr) throw quotaErr
    if (allowed !== true) {
      return json({ error: `You’ve sent several requests today. Please email ${INBOX} instead.` }, 429)
    }

    const label = REQUEST_KINDS[parsed.kind]
    const APP_ORIGIN = (Deno.env.get('APP_ORIGIN') || 'https://budgeer.com').replace(/\/+$/, '')
    const { html, text } = brandEmail({
      origin: APP_ORIGIN,
      heading: `Privacy request: ${label}`,
      paragraphs: [
        `From account ${user.email} (user id ${user.id}).`,
        `Received ${new Date().toISOString()} — answer within one month (GDPR Art. 12(3)).`,
        parsed.message,
      ],
      footer: ['Sent from the Budgeer privacy request form. Reply to answer the user.'],
    })
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM, to: [INBOX], reply_to: user.email,
        subject: `Privacy request: ${label}`, html, text,
      }),
    })
    if (!res.ok) {
      console.error('resend error', res.status, await res.text().catch(() => ''))
      return json({ error: `Could not send your request — please email ${INBOX}.` }, 502)
    }
    return json({ ok: true })
  } catch (e) {
    console.error('privacy-request error', e)
    return json({ error: 'Something went wrong.' }, 500)
  }
}))
