// Edge Function: delete-account
// Permanently deletes the caller's account. Owned groups are auto-transferred
// to the earliest other linked member first (so they survive for everyone
// else); groups where the caller is the only linked member cascade-delete.
// The caller's group memberships become unlinked rows (user_id -> null), so
// their expense history is preserved for co-members.
//
// verify_jwt = true. In addition, a user WITH a password identity must re-prove
// it here (server-side) — the client's password prompt alone can't gate a
// destructive action, since a stolen session could call this directly.
//
// Storage isn't covered by the database cascade, so the caller's files are
// removed through the Storage API first: their `avatars/<uid>/…` folder, and
// the cover image (`group-images/<group id>/…`) of every group that will
// cascade-delete with them. (Receipts are no longer stored at all — 0049.)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cors, json } from '../_shared/http.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
  const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  try {
    const body = await req.json().catch(() => ({}))
    const password = typeof body?.password === 'string' ? body.password : ''

    const authHeader = req.headers.get('Authorization') ?? ''
    const asUser = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } })
    const { data: { user } } = await asUser.auth.getUser()
    if (!user) return json({ error: 'not authenticated' }, 401)
    const uid = user.id

    // Server-side re-auth for password users.
    const providers: string[] = (user.app_metadata?.providers as string[] | undefined)
      ?? (user.app_metadata?.provider ? [user.app_metadata.provider as string] : [])
    if (providers.includes('email')) {
      if (!password) return json({ error: 'Password is required to delete your account.' }, 400)
      const verifier = createClient(SUPABASE_URL, ANON)
      const { error: pwErr } = await verifier.auth.signInWithPassword({ email: user.email!, password })
      if (pwErr) return json({ error: 'Incorrect password.' }, 401)
    }

    const admin = createClient(SUPABASE_URL, SERVICE)

    // Transfer ownership of groups the caller owns to the earliest other linked
    // member so those groups survive; the rest cascade-delete with the user.
    const doomedGroups: string[] = []
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
      } else {
        doomedGroups.push(g.id)
      }
    }

    // Files first: if this fails we stop before deleting the account, so the
    // user can retry rather than leave orphaned files behind.
    await removeFolder(admin, 'avatars', uid)
    for (const gid of doomedGroups) await removeFolder(admin, 'group-images', gid)

    const { error } = await admin.auth.admin.deleteUser(uid)
    if (error) {
      console.error('delete-account admin error', error)
      return json({ error: 'Could not delete the account.' }, 500)
    }
    return json({ ok: true })
  } catch (e) {
    console.error('delete-account error', e)
    return json({ error: 'Something went wrong.' }, 500)
  }
})

// Delete every file under `<folder>/` in a bucket (paths are keyed by the
// owning user / group id, matching the storage RLS policies). Lists in pages
// of 100 until the folder is empty; entries without an id are sub-folder
// placeholders (our layouts are flat), and the pass count is bounded so a
// misbehaving listing can never spin forever.
// deno-lint-ignore no-explicit-any
async function removeFolder(admin: any, bucket: string, folder: string) {
  for (let pass = 0; pass < 100; pass++) {
    const { data, error } = await admin.storage.from(bucket).list(folder, { limit: 100 })
    if (error) throw error
    const files = (data ?? []).filter((o: { id: string | null }) => o.id)
    if (!files.length) return
    const paths = files.map((o: { name: string }) => `${folder}/${o.name}`)
    const { error: rmErr } = await admin.storage.from(bucket).remove(paths)
    if (rmErr) throw rmErr
  }
}
