// Edge Function: send-invite
// Emails a Budgeer group-invite link via Resend, styled to match the app.
// Dormant until RESEND_API_KEY is set (returns 503 so the app falls back to a
// share link). verify_jwt = true.
//
// Hardened: the caller supplies only `to` + `token`. Everything shown in the
// email — the group name, the inviter name, and the join URL — is derived
// SERVER-SIDE from the token and the caller's identity, so a caller can't
// inject HTML, point the button at a phishing URL, or email on behalf of a
// group they're not in. Authorization piggybacks on the caller's RLS: they can
// only read the invite row (and thus send for it) if they're a member.

import { cors, json, callerClient } from '../_shared/http.ts'
import { esc, brandEmail } from '../_shared/email.ts'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function inviteEmail(opts: { heading: string; url: string }): string {
  const heading = esc(opts.heading)
  const url = esc(opts.url)
  return brandEmail({
    inner: `<h1 style="margin:0 0 10px;font-size:20px;color:#242019;">${heading}</h1>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#5f5545;">Budgeer helps you split shared expenses and see who owes whom. Tap below to join the group.</p>
          <a href="${url}" style="display:inline-block;background:#f95d38;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 26px;border-radius:10px;">Join the group</a>
          <p style="margin:26px 0 0;font-size:13px;line-height:1.5;color:#9a8b72;">Or paste this link into your browser:<br><a href="${url}" style="color:#c2703d;word-break:break-all;">${url}</a></p>`,
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
  const FROM = Deno.env.get('INVITE_FROM') || 'Budgeer <onboarding@resend.dev>'
  // Fallback = production origin; the TEST project sets APP_ORIGIN to
  // https://dev.budgeer.com in its function secrets.
  const APP_ORIGIN = (Deno.env.get('APP_ORIGIN') || 'https://budgeer.com').replace(/\/+$/, '')

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
      .select('group_id, groups(name)')
      .eq('token', token)
      .maybeSingle()
    if (!invite) return json({ error: 'not allowed for this invite' }, 403)

    // Inviter name from the caller's own profile (server-side, never trusted input).
    const { data: prof } = await asUser
      .from('profiles').select('display_name').eq('id', user.id).maybeSingle()

    if (!RESEND_API_KEY) {
      return json({ error: 'Email invites are not configured yet (missing RESEND_API_KEY). Use the share link instead.' }, 503)
    }

    // deno-lint-ignore no-explicit-any
    const groupName = (invite as any).groups?.name as string | undefined
    const inviterName = prof?.display_name as string | undefined
    const who = inviterName ? `${inviterName} invited you` : 'You’re invited'
    const group = groupName ? ` to join “${groupName}”` : ''
    const heading = `${who}${group} on Budgeer`
    const url = `${APP_ORIGIN}/join/${token}`
    const html = inviteEmail({ heading, url })

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [to.trim()], subject: `${who}${group} on Budgeer`, html }),
    })
    if (!res.ok) {
      console.error('resend error', res.status, await res.text().catch(() => ''))
      return json({ error: 'Could not send the invite email.' }, 502)
    }
    const data = await res.json()
    return json({ ok: true, id: data?.id })
  } catch (e) {
    console.error('send-invite error', e)
    return json({ error: 'Something went wrong.' }, 500)
  }
})
