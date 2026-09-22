import { supabase, edgeFunctionError } from '../../shared/lib/supabase.js'
import { saveBlob, toBlob } from '../../shared/lib/download.js'

// Financial-statement export. The `generate-report` edge function builds the
// statement (PDF or Excel) server-side; this saves the returned file.
export async function downloadStatement({ from, to, format }) {
  const { data, error } = await supabase.functions.invoke('generate-report', {
    body: { from, to, format },
  })
  if (error) throw new Error(await edgeFunctionError(error))
  saveBlob(toBlob(data), `financial-statement_${from}_${to}.${format}`)
}
