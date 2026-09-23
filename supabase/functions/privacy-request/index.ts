// Edge Function: privacy-request
// The Settings → Privacy request form (restriction, objection, or any other
// data-protection request). Forwards the signed-in user's request to the
// privacy inbox through the existing email processor (Resend) — nowhere else —
// with Reply-To set to the account's own address, so the answer goes to the
// verified email on file, not to anything typed in the form. Once the inbox
// has it, the user gets a receipt (_shared/gdprEmails.ts) with the one-month
// deadline and a copy of what they wrote.
//
// verify_jwt = true. Rate-limited to 3 requests a day per user (consume_quota
// 'privacy-request', 0074). Nothing is stored: the email is the record.

import { withCors, json, callerClient } from '../_shared/http.ts'
import { brandEmail } from '../_shared/email.ts'
import { PRIVACY_EMAIL } from '../_shared/contact.ts'
import { privacyReceiptEmail } from '../_shared/gdprEmails.ts'
import { appOrigin, inviteSender, noticeSender, privacyInbox, sendEmail } from '../_shared/sendEmail.ts'
import { REQUEST_KINDS, validatePrivacyRequest } from '../_shared/privacyRequest.ts'

Deno.serve(withCors(async (req) => {
  const INBOX = privacyInbox()

  try {
    const asUser = callerClient(req)
    const { data: { user } } = await asUser.auth.getUser()
    if (!user?.email) return json({ error: 'not authenticated' }, 401)

    const parsed = validatePrivacyRequest(await req.json().catch(() => ({})))
    if ('error' in parsed) return json({ error: parsed.error }, 400)

    const sender = inviteSender()
    if (!sender) {
      return json({ error: `The form isn’t available right now — please email ${INBOX}.` }, 503)
    }
    const { data: allowed, error: quotaErr } = await asUser.rpc('consume_quota', { p_scope: 'privacy-request' })
    if (quotaErr) throw quotaErr
    if (allowed !== true) {
      return json({ error: `You’ve sent several requests today. Please email ${INBOX} instead.` }, 429)
    }

    const label = REQUEST_KINDS[parsed.kind]
    const origin = appOrigin()
    const receivedAt = new Date()
    const { html, text } = brandEmail({
      origin,
      heading: `Privacy request: ${label}`,
      paragraphs: [
        `From account ${user.email} (user id ${user.id}).`,
        `Received ${receivedAt.toISOString()} — answer within one month (GDPR Art. 12(3)).`,
        parsed.message,
      ],
      footer: ['Sent from the Budgeer privacy request form. Reply to answer the user.'],
    })
    const forwarded = await sendEmail(sender, {
      to: INBOX, replyTo: user.email, subject: `Privacy request: ${label}`, html, text,
    })
    if (!forwarded.ok) {
      return json({ error: `Could not send your request — please email ${INBOX}.` }, 502)
    }

    // The receipt is a courtesy: the request stands even if it can't be sent.
    const notices = noticeSender()
    if (notices) {
      const receipt = privacyReceiptEmail({ origin, privacyEmail: PRIVACY_EMAIL },
        { kindLabel: label, receivedAt, message: parsed.message })
      await sendEmail(notices, { to: user.email, ...receipt })
    }
    return json({ ok: true })
  } catch (e) {
    console.error('privacy-request error', e)
    return json({ error: 'Something went wrong.' }, 500)
  }
}))
