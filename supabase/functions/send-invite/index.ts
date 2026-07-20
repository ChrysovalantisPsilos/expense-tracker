// Edge Function: send-invite
// Emails a Budge group-invite link via Resend, styled to match the app.
// Dormant until RESEND_API_KEY is set (returns 503 so the app falls back to a
// share link). verify_jwt = true.
//
// Hardened: the caller supplies only `to` + `token`. Everything shown in the
// email — the group name, the inviter name, and the join URL — is derived
// SERVER-SIDE from the token and the caller's identity, so a caller can't
// inject HTML, point the button at a phishing URL, or email on behalf of a
// group they're not in. Authorization piggybacks on the caller's RLS: they can
// only read the invite row (and thus send for it) if they're a member.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

// Escape for HTML text/attribute context (defense in depth — these values are
// server-derived, but never interpolate unescaped).
function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function inviteEmail(opts: { heading: string; url: string }): string {
  const heading = esc(opts.heading)
  const url = esc(opts.url)
  return `<!doctype html><html><body style="margin:0;background:#faf8f4;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf8f4;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
        <tr><td style="padding:8px 8px 18px;">
          <span style="font-size:24px;font-weight:800;color:#f95d38;letter-spacing:-0.02em;">budge</span>
        </td></tr>
        <tr><td style="background:#ffffff;border:1px solid #ece7df;border-radius:16px;padding:32px;">
          <h1 style="margin:0 0 10px;font-size:20px;color:#242019;">${heading}</h1>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#5f5545;">Budge helps you split shared expenses and see who owes whom. Tap below to join the group.</p>
          <a href="${url}" style="display:inline-block;background:#f95d38;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 26px;border-radius:10px;">Join the group</a>
          <p style="margin:26px 0 0;font-size:13px;line-height:1.5;color:#9a8b72;">Or paste this link into your browser:<br><a href="${url}" style="color:#c2703d;word-break:break-all;">${url}</a></p>
        </td></tr>
        <tr><td style="padding:20px 8px;text-align:center;color:#9a8b72;font-size:12px;">Budge · your money, your friends, sorted</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
  const FROM = Deno.env.get('INVITE_FROM') || 'Budge <onboarding@resend.dev>'
  const APP_ORIGIN = (Deno.env.get('APP_ORIGIN') || 'https://budge.psilosc.com').replace(/\/+$/, '')

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
    const authHeader = req.headers.get('Authorization') ?? ''
    const asUser = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } })
    const { data: { user } } = await asUser.auth.getUser()
    if (!user) return json({ error: 'not authenticated' }, 401)

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
    const heading = `${who}${group} on Budge`
    const url = `${APP_ORIGIN}/join/${token}`
    const html = inviteEmail({ heading, url })

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [to.trim()], subject: `${who}${group} on Budge`, html }),
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
