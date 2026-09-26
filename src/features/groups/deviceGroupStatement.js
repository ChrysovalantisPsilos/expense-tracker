// The group statement made on the device: the same reads the edge function
// made, run with the user's own session, and the same builder
// (supabase/functions/group-report/groupStatement.ts). Loaded with import()
// on export; the PDF is made in the statement worker
// (shared/lib/statementOffThread.js), off the page's thread.
import { loadGroupStatement } from '../../../supabase/functions/group-report/groupStatement.ts'
import { UserError } from '../../shared/lib/errors.js'
import { statementOffThread } from '../../shared/lib/statementOffThread.js'
import { t } from '../../shared/lib/i18n/i18n.js'

// The PDF's bytes. `supabase` is the signed-in client; `signal` stops the work.
export async function groupStatementOnDevice(supabase, groupId, { signal } = {}) {
  const input = await loadGroupStatement(supabase, groupId)
  // What the edge function answers a non-member (403).
  if (!input) throw new UserError(t('groups:detail.reportNotAllowed'))
  return statementOffThread({ kind: 'group', input }, { signal })
}
