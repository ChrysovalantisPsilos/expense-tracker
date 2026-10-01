// Delivery fan-out for one notification row — called by the notify_fanout DB
// trigger (pg_net) on every insert into public.notifications. verify_jwt is
// OFF; auth is the shared x-cron-secret checked against Vault (same secret and
// trust domain as the reminders cron: this database calling this project).
//
// Channels, gated by the user's profile switches:
//   push  (profiles.notify_push)  — every notification type, to the browsers
//          (web push, VAPID keys in Vault) and to the iOS apps (APNs,
//          _shared/apns.ts; function secrets APNS_KEY_ID, APNS_TEAM_ID,
//          APNS_KEY_P8 — skipped without them)
//   email (profiles.notify_email) — big events only: invite, member_joined,
//          member_left. Email invites sent through send-invite already emailed
//          the recipient, so those are skipped here (invite has invited_email).

import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'
import { brandEmail } from '../_shared/email.ts'
import { appOrigin, inviteSender, sendEmail } from '../_shared/sendEmail.ts'
import { requireCronSecret } from '../_shared/cron.ts'
import { eachLimited, isAllowedPushEndpoint } from '../_shared/push.ts'
import {
  apnsConfig, apnsPayload, apnsRequest, apnsTopic, isDeadToken, providerTokenCache,
} from '../_shared/apns.ts'

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

// One APNs provider token per warm instance (Apple: reuse it 20–60 minutes).
const providerToken = providerTokenCache()

const EMAIL_TYPES = new Set(['invite', 'member_joined', 'member_left'])

// Where tapping the push lands you.
function urlFor(n: { type: string; group_id: string | null }): string {
  if (n.type === 'reminder') return '/recurring'
  if (n.type === 'invite') return '/groups'
  if (n.type === 'budget') return '/budgets'
  if (n.type === 'digest') return '/'
  return n.group_id ? `/groups/${n.group_id}` : '/groups'
}

Deno.serve(async (req) => {
  const secrets = await requireCronSecret(admin, req)
  if (secrets instanceof Response) return secrets

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
      secrets.vapid_subject ?? 'https://budgeer.com', // RFC 8292: a URL subject is valid; no contact address
      secrets.vapid_public_key,
      secrets.vapid_private_key,
    )
    const { data: subs } = await admin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', n.user_id)
    const payload = JSON.stringify({ title: n.title, body: n.body ?? '', url: urlFor(n) })
    // Only real browser push services (rows saved before 0058 weren't
    // checked), at most 10 devices, 4 requests in flight at a time.
    const targets = (subs ?? []).filter((s) => isAllowedPushEndpoint(s.endpoint)).slice(0, 10)
    await eachLimited(targets, 4, async (s) => {
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
    })
  }

  // -- iOS apps (APNs, all types) --------------------------------------------
  const apns = apnsConfig((name) => Deno.env.get(name))
  if ((prefs?.notify_push ?? true) && apns) {
    const { data: devices } = await admin
      .from('apns_devices')
      .select('id, token, env')
      .eq('user_id', n.user_id)
      .order('last_seen_at', { ascending: false })
      .limit(10)
    if (devices?.length) {
      const jwt = await providerToken(apns, Date.now() / 1000)
      const topic = apnsTopic(Deno.env.get('SUPABASE_URL'))
      const payload = apnsPayload({ title: n.title, body: n.body, url: urlFor(n), id: n.id })
      await eachLimited(devices, 4, async (d) => {
        const { url, init } = apnsRequest({ env: d.env, token: d.token, topic, jwt, payload })
        const res = await fetch(url, init)
        if (res.ok) { pushed += 1; await res.body?.cancel(); return }
        const reason = (await res.json().catch(() => null))?.reason ?? null
        if (isDeadToken(res.status, reason)) {
          await admin.from('apns_devices').delete().eq('id', d.id)
        } else {
          console.error('[notify-user] APNs refused a notification:', res.status, reason)
        }
      })
    }
  }

  // -- Email (big events only) ------------------------------------------------
  const sender = inviteSender()
  if ((prefs?.notify_email ?? true) && EMAIL_TYPES.has(n.type) && sender) {
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
        const origin = appOrigin()
        // Same branded layout as send-invite's email.
        const { html, text } = brandEmail({
          origin,
          heading: n.title,
          paragraphs: n.body ? [n.body] : [],
          cta: { label: 'Open Budgeer', url: `${origin}${urlFor(n)}` },
          footer: ['You can turn these emails off in Settings → Notifications.'],
        })
        emailed = (await sendEmail(sender, { to, subject: n.title, html, text })).ok
      }
    }
  }

  return new Response(JSON.stringify({ pushed, emailed }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
