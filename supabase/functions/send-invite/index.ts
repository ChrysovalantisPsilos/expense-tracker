// Edge Function: send-invite
// Emails a Budge group-invite link via Resend. Dormant until RESEND_API_KEY is
// set (returns 503 with a clear message so the app can fall back to share links).
//
//   POST { to, url, groupName, inviterName }
// verify_jwt = true: only signed-in users can send invites.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
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
    const html = `
      <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#242019">
        <div style="font-size:22px;font-weight:700;color:#f95d38;margin-bottom:8px">budge</div>
        <h2 style="font-size:18px;margin:16px 0 4px">${who}${group} on Budge</h2>
        <p style="color:#5f5545;line-height:1.5">Budge lets you split shared expenses and see who owes whom. Tap below to join the group.</p>
        <a href="${url}" style="display:inline-block;margin:16px 0;background:#f95d38;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600">Join the group</a>
        <p style="color:#9a8b72;font-size:13px">Or paste this link into your browser:<br>${url}</p>
      </div>`

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM, to: [to], subject: `${who}${group} on Budge`, html }),
    })
    const data = await res.json()
    if (!res.ok) return json({ error: data?.message || 'Resend error', detail: data }, 502)
    return json({ ok: true, id: data?.id })
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500)
  }
})
