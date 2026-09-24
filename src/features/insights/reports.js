import { supabase } from '../../shared/lib/supabase.js'
import { saveBlob, toBlob } from '../../shared/lib/download.js'
import { FILE_TYPES } from '../../../supabase/functions/_shared/files.ts'
import { edgeFunctionError } from '../../shared/lib/errors.js'

// Financial-statement export. The `generate-report` edge function builds the
// statement (PDF or Excel) server-side; this saves the returned file.
export async function downloadStatement({ from, to, format }) {
  const { data, error } = await supabase.functions.invoke('generate-report', {
    body: { from, to, format },
  })
  if (error) throw await edgeFunctionError(error)
  saveBlob(toBlob(data, FILE_TYPES[format]), `financial-statement_${from}_${to}.${format}`)
}
