// The group statement made on the device: the same reads the edge function
// made, run with the user's own session, and the same builder
// (supabase/functions/group-report/groupStatement.ts). Loaded with import()
// on export, with pdf-lib.
import { groupStatementPdf, loadGroupStatement } from '../../../supabase/functions/group-report/groupStatement.ts'
import { UserError } from '../../shared/lib/errors.js'

// The PDF's bytes. `supabase` is the signed-in client.
export async function groupStatementOnDevice(supabase, groupId) {
  const [input, { browserPdf }] = await Promise.all([
    loadGroupStatement(supabase, groupId),
    import('../../shared/lib/pdf.js'),
  ])
  // What the edge function answers a non-member (403).
  if (!input) throw new UserError('Not allowed for this group.')
  return groupStatementPdf(browserPdf, input)
}
