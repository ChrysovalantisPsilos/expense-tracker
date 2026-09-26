import { supabase } from '../../shared/lib/supabase.js'
import { saveBlob, toBlob } from '../../shared/lib/download.js'
import { FILE_TYPES, statementFilename } from '../../../supabase/functions/_shared/files.ts'
import { edgeFunctionError } from '../../shared/lib/errors.js'
import { deviceFirst } from '../../shared/lib/deviceFirst.js'

// Financial-statement export (PDF or Excel). The statement is made on the
// device (deviceStatement.js, loaded on demand); for one release the
// `generate-report` edge function remains the fallback (deviceFirst.js), also
// when the device takes too long. `onProgress` hears the PDF page being made
// (null once the server has taken over).
export async function downloadStatement({ from, to, format, onProgress }) {
  const file = await deviceFirst('statement',
    async (signal) => (await import('./deviceStatement.js'))
      .statementOnDevice(supabase, { from, to, format, onProgress, signal }),
    () => {
      onProgress?.(null)
      return statementFromServer({ from, to, format })
    })
  saveBlob(toBlob(file, FILE_TYPES[format]), statementFilename(from, to, format))
}

// TODO(release after next): remove with the generate-report function.
async function statementFromServer({ from, to, format }) {
  const { data, error } = await supabase.functions.invoke('generate-report', {
    body: { from, to, format },
  })
  if (error) throw await edgeFunctionError(error)
  return data
}
