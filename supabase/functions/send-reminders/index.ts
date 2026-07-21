// Payment reminders — called daily by pg_cron (send_payment_reminders → pg_net).
// Deployed with verify_jwt OFF; auth is a shared secret: the caller sends
// x-cron-secret, which must match the reminder_cron_secret Vault entry
// (fetched via the service_role-only reminder_secrets() RPC).
//
// For every active recurring rule whose reminder window has opened
// (today >= next_run − remind_days_before, and next_run still in the future),
// it inserts an in-app bell notification and web-pushes the user's subscribed
// devices, then stamps last_reminded_for = next_run so each occurrence
// reminds exactly once.

import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

// Zero-decimal currencies (kept in sync with the frontend's currency.js).
const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'CLP'])
function money(minor: number, currency: string): string {
  const factor = ZERO_DECIMAL.has(currency) ? 1 : 100
  const amount = (minor / factor).toLocaleString('en-US', {
    minimumFractionDigits: factor === 1 ? 0 : 2,
    maximumFractionDigits: factor === 1 ? 0 : 2,
  })
  const symbol = { EUR: '€', USD: '$', GBP: '£', JPY: '¥' }[currency]
  return symbol ? `${symbol}${amount}` : `${amount} ${currency}`
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10)
}

function daysUntil(iso: string, today: string): number {
  return Math.round((Date.parse(iso) - Date.parse(today)) / 86_400_000)
}

Deno.serve(async (req) => {
  const { data: secrets, error: secErr } = await admin.rpc('reminder_secrets')
  if (secErr || !secrets?.reminder_cron_secret) {
    return new Response('secrets unavailable', { status: 500 })
  }
  if (req.headers.get('x-cron-secret') !== secrets.reminder_cron_secret) {
    return new Response('forbidden', { status: 403 })
  }

  const canPush = !!(secrets.vapid_public_key && secrets.vapid_private_key)
  if (canPush) {
    webpush.setVapidDetails(
      secrets.vapid_subject ?? 'mailto:admin@example.com',
      secrets.vapid_public_key,
      secrets.vapid_private_key,
    )
  }

  const today = isoToday()
  const { data: rules, error } = await admin
    .from('recurring_rules')
    .select('id, user_id, kind, description, amount_minor, currency, next_run, remind_days_before, last_reminded_for')
    .eq('is_active', true)
    .not('remind_days_before', 'is', null)
    .gt('next_run', today)
  if (error) return new Response(error.message, { status: 500 })

  const due = (rules ?? []).filter((r) =>
    daysUntil(r.next_run, today) <= r.remind_days_before &&
    r.last_reminded_for !== r.next_run,
  )

  // One subscription fetch per user, shared across their due rules.
  const subsByUser = new Map<string, { id: string; endpoint: string; p256dh: string; auth: string }[]>()
  async function subsFor(userId: string) {
    if (!subsByUser.has(userId)) {
      const { data } = await admin.from('push_subscriptions')
        .select('id, endpoint, p256dh, auth').eq('user_id', userId)
      subsByUser.set(userId, data ?? [])
    }
    return subsByUser.get(userId)!
  }

  let notified = 0
  let pushed = 0
  for (const r of due) {
    const days = daysUntil(r.next_run, today)
    const name = r.description || (r.kind === 'income' ? 'Recurring income' : 'Recurring payment')
    const when = days === 1 ? 'tomorrow' : `in ${days} days`
    const title = r.kind === 'income' ? `Incoming: ${name}` : `Upcoming payment: ${name}`
    const body = `${money(r.amount_minor, r.currency)} ${r.kind === 'income' ? 'expected' : 'due'} ${when} (${r.next_run}).`

    const { error: nErr } = await admin.from('notifications').insert({
      user_id: r.user_id, type: 'reminder', title, body,
    })
    if (nErr) continue // don't stamp — retry tomorrow

    if (canPush) {
      const payload = JSON.stringify({ title, body, url: '/recurring' })
      for (const s of await subsFor(r.user_id)) {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
          )
          pushed += 1
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode
          if (code === 404 || code === 410) {
            // Subscription expired/revoked — drop it.
            await admin.from('push_subscriptions').delete().eq('id', s.id)
          }
        }
      }
    }

    await admin.from('recurring_rules')
      .update({ last_reminded_for: r.next_run }).eq('id', r.id)
    notified += 1
  }

  return new Response(JSON.stringify({ checked: due.length, notified, pushed }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
