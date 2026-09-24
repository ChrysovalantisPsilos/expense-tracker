// Edge Function: send-invite
// Emails a Budgeer group-invite link via Resend, in the shared branded layout
// (_shared/email.ts: escaped HTML + a plain-text alternative).
// Dormant until RESEND_API_KEY is set (returns 503 so the app falls back to a
// share link). verify_jwt = true.
//
// Hardened: the caller supplies only `to` + `token`. Everything shown in the
// email — the group name, the inviter name, and the join URL — is derived
// SERVER-SIDE from the token and the caller's identity, so a caller can't
// inject HTML, point the button at a phishing URL, or email on behalf of a
// group they're not in. Authorization piggybacks on the caller's RLS: they can
// only read the invite row (and thus send for it) if they're a member.
//
// Anti-abuse: the recipient must be the address the invite was created for;
// the subject line is fixed (user-chosen names appear only in the escaped
// body); and on top of the caller's quota, any one address gets at most 3
// invite emails a day, whoever sends them.

import { withCors, json, callerClient } from '../_shared/http.ts'
import { brandEmail } from '../_shared/email.ts'
import { appOrigin, inviteSender, sendEmail } from '../_shared/sendEmail.ts'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const SUBJECT = 'You’re invited to a group on Budgeer'

Deno.serve(withCors(async (req) => {
  const sender = inviteSender()
  const APP_ORIGIN = appOrigin()

  try {
    const { to, token } = await req.json()
    if (!to || !token) return json({ error: 'to and token are required' }, 400)
    if (typeof to !== 'string' || !EMAIL_RE.test(to.trim())) {
      return json({ error: 'invalid recipient email' }, 400)
    }
    if (typeof token !== 'string' || !/^[A-Za-z0-9._-]{16,}$/.test(token)) {
      return json({ error: 'invalid token' }, 400)
    }

    // Authorize via the caller's own session + RLS: they can only read the
    // invite (and its group) if they're a member of that group.
    const asUser = callerClient(req)
    const { data: { user } } = await asUser.auth.getUser()
    if (!user) return json({ error: 'not authenticated' }, 401)

    // Per-caller quota (keyed on the caller's own uid server-side). Fails closed.
    const { data: allowed, error: quotaErr } = await asUser.rpc('consume_quota', { p_scope: 'send-invite' })
    if (quotaErr) throw quotaErr
    if (allowed !== true) return json({ error: 'Too many invites sent. Please try again later.' }, 429)

    const { data: invite } = await asUser
      .from('group_invites')
      .select('group_id, invited_email, groups(name)')
      .eq('token', token)
      .maybeSingle()
    if (!invite) return json({ error: 'not allowed for this invite' }, 403)
    const recipient = to.trim().toLowerCase()
    if ((invite.invited_email ?? '').trim().toLowerCase() !== recipient) {
      return json({ error: 'This invite was created for a different address.' }, 403)
    }

    // Inviter name from the caller's own profile (server-side, never trusted input).
    const { data: prof } = await asUser
      .from('profiles').select('display_name').eq('id', user.id).maybeSingle()

    if (!sender) {
      console.error('send-invite: RESEND_API_KEY is not set')
      return json({ error: 'Email invites aren’t available right now. Use the share link instead.' }, 503)
    }

    const { data: recipientOk, error: rqErr } = await asUser.rpc('consume_invite_recipient_quota', { p_email: recipient })
    if (rqErr) throw rqErr
    if (recipientOk !== true) return json({ error: 'That address has already been sent several invites today.' }, 429)

    // deno-lint-ignore no-explicit-any
    const groupName = (invite as any).groups?.name as string | undefined
    const inviterName = prof?.display_name as string | undefined
    const who = inviterName ? `${inviterName} invited you` : 'You’re invited'
    const group = groupName ? ` to join “${groupName}”` : ''
    const heading = `${who}${group} on Budgeer`
    const { html, text } = brandEmail({
      origin: APP_ORIGIN,
      heading,
      paragraphs: ['Budgeer helps you split shared expenses and see who owes whom. Tap below to join the group.'],
      cta: { label: 'Join the group', url: `${APP_ORIGIN}/join/${token}` },
      showLink: true,
    })

    const sent = await sendEmail(sender, { to: recipient, subject: SUBJECT, html, text })
    if (!sent.ok) return json({ error: 'Could not send the invite email.' }, 502)
    return json({ ok: true, id: sent.id })
  } catch (e) {
    console.error('send-invite error', e)
    return json({ error: 'Something went wrong.' }, 500)
  }
}))
