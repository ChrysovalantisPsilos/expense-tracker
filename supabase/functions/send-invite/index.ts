// Edge Function: send-invite
// Emails a Budge group-invite link via Resend, styled to match the app.
// Dormant until RESEND_API_KEY is set (returns 503 so the app falls back to a
// share link). verify_jwt = true.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

function inviteEmail(opts: { heading: string; url: string }): string {
  const { heading, url } = opts
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

  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
  const FROM = Deno.env.get('INVITE_FROM') || 'Budge <onboarding@resend.dev>'

  try {
    const { to, url, groupName, inviterName } = await req.json()
    if (!to || !url) return json({ error: 'to and url are required' }, 400)
    if (!RESEND_API_KEY) {
      return json({ error: 'Email invites are not configured yet (missing RESEND_API_KEY). Use the share link instead.' }, 503)
    }

    const who = inviterName ? `${inviterName} invited you` : 'You’re invited'
    const group = groupName ? ` to join “${groupName}”` : ''
    const heading = `${who}${group} on Budge`
    const html = inviteEmail({ heading, url })

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [to], subject: `${who}${group} on Budge`, html }),
    })
    const data = await res.json()
    if (!res.ok) return json({ error: data?.message || 'Resend error', detail: data }, 502)
    return json({ ok: true, id: data?.id })
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500)
  }
})
