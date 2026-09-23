// Edge Function: delete-account
// Permanently deletes the caller's account (GDPR Art. 17). The deletion itself
// — owned-group hand-over, file removal, the auth-user delete that cascades
// personal rows and anonymises shared group history — lives in
// _shared/accountDeletion.ts, shared with the inactivity sweep.
//
// verify_jwt = true. In addition, a user WITH a password identity must re-prove
// it here (server-side) — the client's password prompt alone can't gate a
// destructive action, since a stolen session could call this directly.
//
// Afterwards a confirmation (_shared/gdprEmails.ts) goes to the account's
// address, captured before the deletion (the auth user is gone after it). It
// carries the date and what was removed or kept — nothing from the account.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { withCors, json } from '../_shared/http.ts'
import { PRIVACY_EMAIL } from '../_shared/contact.ts'
import { deleteAccount } from '../_shared/accountDeletion.ts'
import { accountDeletedEmail } from '../_shared/gdprEmails.ts'
import { appOrigin, noticeSender, sendEmail } from '../_shared/sendEmail.ts'

Deno.serve(withCors(async (req) => {
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
    const email = user.email ?? null

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
    try {
      await deleteAccount(admin, uid)
    } catch (e) {
      console.error('delete-account admin error', e)
      return json({ error: 'Could not delete the account.' }, 500)
    }

    // The account is gone either way; a failed confirmation is only logged.
    const sender = noticeSender()
    if (sender && email) {
      const mail = accountDeletedEmail({ origin: appOrigin(), privacyEmail: PRIVACY_EMAIL }, { deletedAt: new Date() })
      await sendEmail(sender, { to: email, ...mail })
    }
    return json({ ok: true })
  } catch (e) {
    console.error('delete-account error', e)
    return json({ error: 'Something went wrong.' }, 500)
  }
}))
