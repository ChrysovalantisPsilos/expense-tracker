// The financial statement made on the device: the same reads the edge
// function made, run with the user's own session, and the same builder
// (supabase/functions/generate-report/statementFile.ts), so the file looks
// and adds up the same, without the transactions leaving the phone. Loaded
// with import() on export; it loads only the library its format needs
// (pdf-lib for a PDF, the app's SheetJS for Excel).
import { loadStatement, statementBytes } from '../../../supabase/functions/generate-report/statementFile.ts'

async function libsFor(format) {
  if (format === 'pdf') return { pdf: (await import('../../shared/lib/pdf.js')).browserPdf }
  return { xlsx: await import('xlsx') }
}

// The statement's bytes. `supabase` is the signed-in client.
export async function statementOnDevice(supabase, { from, to, format }) {
  const [input, libs] = await Promise.all([loadStatement(supabase, { from, to }), libsFor(format)])
  return statementBytes(format, input, libs)
}
