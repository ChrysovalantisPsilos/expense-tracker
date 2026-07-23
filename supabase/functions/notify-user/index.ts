// Delivery fan-out for one notification row — called by the notify_fanout DB
// trigger (pg_net) on every insert into public.notifications. verify_jwt is
// OFF; auth is the shared x-cron-secret checked against Vault (same secret and
// trust domain as the reminders cron: this database calling this project).
//
// Channels, gated by the user's profile switches:
//   push  (profiles.notify_push)  — every notification type
//   email (profiles.notify_email) — big events only: invite, member_joined,
//          member_left. Email invites sent through send-invite already emailed
//          the recipient, so those are skipped here (invite has invited_email).

import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const EMAIL_TYPES = new Set(['invite', 'member_joined', 'member_left'])

// Where tapping the push lands you.
function urlFor(n: { type: string; group_id: string | null }): string {
  if (n.type === 'reminder') return '/recurring'
  if (n.type === 'invite') return '/groups'
  if (n.type === 'budget') return '/budgets'
  if (n.type === 'digest') return '/'
  return n.group_id ? `/groups/${n.group_id}` : '/groups'
}

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// Same visual language as send-invite's email.
function eventEmail(opts: { title: string; body: string; url: string }): string {
  const title = esc(opts.title)
  const body = esc(opts.body)
  const url = esc(opts.url)
  return `<!doctype html><html><body style="margin:0;background:#faf8f4;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf8f4;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
        <tr><td style="padding:8px 8px 18px;">
          <span style="font-size:24px;font-weight:800;color:#f95d38;letter-spacing:-0.02em;">budgeer</span>
        </td></tr>
        <tr><td style="background:#ffffff;border:1px solid #ece7df;border-radius:16px;padding:32px;">
          <h1 style="margin:0 0 10px;font-size:20px;color:#242019;">${title}</h1>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#5f5545;">${body}</p>
          <a href="${url}" style="display:inline-block;background:#f95d38;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 26px;border-radius:10px;">Open Budgeer</a>
        </td></tr>
        <tr><td style="padding:20px 8px;text-align:center;color:#9a8b72;font-size:12px;">Budgeer · your money, your friends, sorted<br>You can turn these emails off in Profile → Notifications.</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

Deno.serve(async (req) => {
  const { data: secrets, error: secErr } = await admin.rpc('reminder_secrets')
  if (secErr || !secrets?.reminder_cron_secret) {
    return new Response('secrets unavailable', { status: 500 })
  }
  if (req.headers.get('x-cron-secret') !== secrets.reminder_cron_secret) {
    return new Response('forbidden', { status: 403 })
  }

  const { notification_id } = await req.json().catch(() => ({}))
  if (!notification_id) return new Response('notification_id required', { status: 400 })

  const { data: n, error } = await admin
    .from('notifications')
    .select('id, user_id, type, title, body, group_id, invite_id')
    .eq('id', notification_id)
    .maybeSingle()
  if (error || !n) return new Response('notification not found', { status: 404 })

  const { data: prefs } = await admin
    .from('profiles')
    .select('notify_push, notify_email')
    .eq('id', n.user_id)
    .maybeSingle()

  let pushed = 0
  let emailed = false

  // -- Web push (all types) ---------------------------------------------------
  if ((prefs?.notify_push ?? true) && secrets.vapid_public_key && secrets.vapid_private_key) {
    webpush.setVapidDetails(
      secrets.vapid_subject ?? 'mailto:admin@example.com',
      secrets.vapid_public_key,
      secrets.vapid_private_key,
    )
    const { data: subs } = await admin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', n.user_id)
    const payload = JSON.stringify({ title: n.title, body: n.body ?? '', url: urlFor(n) })
    for (const s of subs ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        )
        pushed += 1
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode
        if (code === 404 || code === 410) {
          await admin.from('push_subscriptions').delete().eq('id', s.id)
        }
      }
    }
  }

  // -- Email (big events only) ------------------------------------------------
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
  if ((prefs?.notify_email ?? true) && EMAIL_TYPES.has(n.type) && RESEND_API_KEY) {
    // Email invites were already emailed by send-invite — don't double up.
    let skip = false
    if (n.type === 'invite' && n.invite_id) {
      const { data: inv } = await admin
        .from('group_invites').select('invited_email').eq('id', n.invite_id).maybeSingle()
      skip = !!inv?.invited_email
    }
    if (!skip) {
      const { data: userData } = await admin.auth.admin.getUserById(n.user_id)
      const to = userData?.user?.email
      if (to) {
        const FROM = Deno.env.get('INVITE_FROM') || 'Budgeer <onboarding@resend.dev>'
        // Fallback = production origin; the TEST project sets APP_ORIGIN to
        // https://dev.budgeer.com in its function secrets.
        const APP_ORIGIN = (Deno.env.get('APP_ORIGIN') || 'https://budgeer.com').replace(/\/+$/, '')
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: FROM, to: [to],
            subject: n.title,
            html: eventEmail({ title: n.title, body: n.body ?? '', url: `${APP_ORIGIN}${urlFor(n)}` }),
          }),
        })
        emailed = res.ok
        if (!res.ok) console.error('resend error', res.status, await res.text().catch(() => ''))
      }
    }
  }

  return new Response(JSON.stringify({ pushed, emailed }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
