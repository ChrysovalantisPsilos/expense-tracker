// The x-cron-secret gate shared by the functions the database calls (pg_cron /
// pg_net → notify-user, send-reminders; verify_jwt = false). The secret and
// the push keys come from Vault via the service_role-only reminder_secrets()
// RPC. No imports: the unit tests load this file directly.

// Constant-time string comparison: both sides are hashed first, so neither the
// length nor the position of the first difference leaks through timing.
export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder()
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ])
  const x = new Uint8Array(ha)
  const y = new Uint8Array(hb)
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]
  return diff === 0
}

export interface CronSecrets {
  reminder_cron_secret: string
  vapid_public_key?: string
  vapid_private_key?: string
  vapid_subject?: string
}

// Returns the Vault secrets when the request carries the right x-cron-secret,
// otherwise the Response to send back (500 without secrets, 403 on mismatch).
// deno-lint-ignore no-explicit-any
export async function requireCronSecret(admin: any, req: Request): Promise<CronSecrets | Response> {
  const { data: secrets, error } = await admin.rpc('reminder_secrets')
  if (error || !secrets?.reminder_cron_secret) {
    return new Response('secrets unavailable', { status: 500 })
  }
  const given = req.headers.get('x-cron-secret') ?? ''
  if (!(await timingSafeEqual(given, secrets.reminder_cron_secret))) {
    return new Response('forbidden', { status: 403 })
  }
  return secrets as CronSecrets
}
