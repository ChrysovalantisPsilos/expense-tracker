// The financial statement made on the device: the same reads the edge
// function made, run with the user's own session, and the same builder
// (supabase/functions/generate-report/statementFile.ts), so the file looks
// and adds up the same, without the transactions leaving the phone. Loaded
// with import() on export. The reads run here; the file is made in the
// statement worker (shared/lib/statementOffThread.js), so the page stays
// responsive however long the statement.
import { loadStatement } from '../../../supabase/functions/generate-report/statementFile.ts'
import { statementOffThread } from '../../shared/lib/statementOffThread.js'

// The statement's bytes. `supabase` is the signed-in client; `onProgress`
// hears the PDF page being made; `signal` stops the work.
export async function statementOnDevice(supabase, { from, to, format, onProgress, signal }) {
  const input = await loadStatement(supabase, { from, to })
  return statementOffThread({ kind: 'personal', format, input }, { onProgress, signal })
}
