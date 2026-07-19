// Edge Function: delete-account
// Permanently deletes the caller's account. Owned groups are auto-transferred
// to the earliest other linked member first (so they survive for everyone
// else); groups where the caller is the only linked member cascade-delete.
// The caller's group memberships become phantom rows (user_id -> null), so
// their expense history is preserved.
//
// verify_jwt = true: identity comes from the caller's JWT. The client is
// expected to re-verify the user (password re-entry / typed phrase) before
// calling this.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
  const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  try {
    // Identify the caller from their JWT.
    const authHeader = req.headers.get('Authorization') ?? ''
    const asUser = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } })
    const { data: { user } } = await asUser.auth.getUser()
    if (!user) return json({ error: 'not authenticated' }, 401)
    const uid = user.id

    const admin = createClient(SUPABASE_URL, SERVICE)

    // Transfer ownership of groups the caller owns to the earliest other
    // linked member, so those groups survive.
    const { data: owned } = await admin.from('groups').select('id').eq('owner_id', uid)
    for (const g of owned ?? []) {
      const { data: others } = await admin
        .from('group_members')
        .select('id, user_id')
        .eq('group_id', g.id)
        .not('user_id', 'is', null)
        .neq('user_id', uid)
        .order('created_at', { ascending: true })
        .limit(1)
      const next = others?.[0]
      if (next) {
        await admin.from('groups').update({ owner_id: next.user_id }).eq('id', g.id)
        await admin.from('group_members').update({ role: 'owner' }).eq('id', next.id)
      }
      // If no other linked member, the group cascade-deletes with the user.
    }

    // Delete the auth user (cascades personal data; memberships -> phantom).
    const { error } = await admin.auth.admin.deleteUser(uid)
    if (error) return json({ error: error.message }, 500)

    return json({ ok: true })
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500)
  }
})
