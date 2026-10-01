// Edge Function: group-report
// The server-side FALLBACK for the group statement PDF. The app builds it on
// the device (src/features/groups/deviceGroupStatement.js) and only calls
// this when that fails (an old browser, say).
// TODO(release after next): delete the web app's fallback to it (see
// docs/TESTING.md, "Statements on the device"), but keep this function while
// the native iOS app makes its group statement here (a group's … menu).
// verify_jwt = true.
//
// Auth/isolation: the function uses the CALLER'S JWT with the anon key, so RLS
// restricts everything to groups the caller is a member of. A non-member gets
// an empty group lookup → 403. No service-role key is used. What the
// statement reads and shows is groupStatement.ts, shared with the app.

import { denoPdf } from '../_shared/pdfDeno.ts'
import { withCors, json, callerClient } from '../_shared/http.ts'
import { fileResponse } from '../_shared/files.ts'
import { groupStatementPdf, loadGroupStatement } from './groupStatement.ts'

Deno.serve(withCors(async (req) => {
  try {
    const { group_id } = await req.json()
    if (!group_id || typeof group_id !== 'string') return json({ error: 'group_id is required' }, 400)

    const supabase = callerClient(req)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return json({ error: 'not authenticated' }, 401)
    // Per-caller quota (keyed on the caller's own uid server-side). Fails closed.
    const { data: allowed, error: quotaErr } = await supabase.rpc('consume_quota', { p_scope: 'group-report' })
    if (quotaErr) throw quotaErr
    if (allowed !== true) return json({ error: 'Too many report requests. Please try again later.' }, 429)

    const input = await loadGroupStatement(supabase, group_id)
    if (!input) return json({ error: 'not allowed for this group' }, 403)

    const bytes = await groupStatementPdf(denoPdf, input)
    return fileResponse(bytes, 'pdf', `${input.group.name}-statement.pdf`)
  } catch (e) {
    console.error('group-report error', e)
    return json({ error: 'Could not generate the report.' }, 500)
  }
}))
