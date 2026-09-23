// Payment reminders — called daily by pg_cron (send_payment_reminders → pg_net).
// Deployed with verify_jwt OFF; auth is a shared secret: the caller sends
// x-cron-secret, which must match the reminder_cron_secret Vault entry
// (fetched via the service_role-only reminder_secrets() RPC).
//
// For every active recurring rule whose reminder window has opened
// (today >= next_run − remind_days_before, and next_run still in the future),
// it inserts a bell notification and stamps last_reminded_for = next_run so
// each occurrence reminds exactly once. Delivery (web push, gated by the
// user's switches) happens downstream: the notify_fanout trigger forwards
// every notifications insert to the notify-user function.
//
// A rule's amount and description are encrypted at rest (0050), and — as with
// the budget alerts (0047) — the notification text must not copy them back into
// notifications.body in plaintext. So this function reads only the plain
// schedule columns and sends a generic reminder; the details are one tap away.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { requireCronSecret } from '../_shared/cron.ts'

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

function isoToday(): string {
  return new Date().toISOString().slice(0, 10)
}

function daysUntil(iso: string, today: string): number {
  return Math.round((Date.parse(iso) - Date.parse(today)) / 86_400_000)
}

Deno.serve(async (req) => {
  const gate = await requireCronSecret(admin, req)
  if (gate instanceof Response) return gate

  const today = isoToday()
  const { data: rules, error } = await admin
    .from('recurring_rules')
    .select('id, user_id, kind, next_run, remind_days_before, last_reminded_for')
    .eq('is_active', true)
    .not('remind_days_before', 'is', null)
    .gt('next_run', today)
  if (error) return new Response(error.message, { status: 500 })

  const due = (rules ?? []).filter((r) =>
    daysUntil(r.next_run, today) <= r.remind_days_before &&
    r.last_reminded_for !== r.next_run,
  )

  let notified = 0
  for (const r of due) {
    const days = daysUntil(r.next_run, today)
    const when = days === 1 ? 'tomorrow' : `in ${days} days`
    const title = r.kind === 'income' ? 'Upcoming income' : 'Upcoming payment'
    const body = r.kind === 'income'
      ? `A recurring income is expected ${when} (${r.next_run}).`
      : `A recurring payment is due ${when} (${r.next_run}).`

    const { error: nErr } = await admin.from('notifications').insert({
      user_id: r.user_id, type: 'reminder', title, body,
    })
    if (nErr) continue // don't stamp — retry tomorrow

    await admin.from('recurring_rules')
      .update({ last_reminded_for: r.next_run }).eq('id', r.id)
    notified += 1
  }

  return new Response(JSON.stringify({ checked: due.length, notified }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
