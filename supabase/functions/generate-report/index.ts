// Supabase Edge Function: generate-report
//
// The server-side FALLBACK for the personal financial statement. The app
// builds the statement on the device (src/features/insights/deviceStatement.js)
// and only calls this when that fails (an old browser, say).
// TODO(release after next): delete this function and the app's fallback to it
// (see docs/TESTING.md, "Statements on the device").
//
//   POST /functions/v1/generate-report
//   body: { from: "2026-01-01", to: "2026-01-31", format: "xlsx" | "pdf" }
//
// Auth: verify_jwt = true. We read the caller's JWT, create a Supabase client
// scoped to that user, and pull only their data through it (RLS, and the
// decrypting my_transactions RPC for their own rows). No service-role key is
// used. What the statement contains, and how it adds up, is statementFile.ts,
// shared with the app.
//
// Excel is SheetJS (0.18.5: the edge bundler only fetches allow-listed hosts,
// and the app's 0.20.3 build is served from cdn.sheetjs.com alone, so it can't
// be imported here; writing a workbook is unaffected); the PDF uses the shared
// brand toolkit (_shared/pdf.ts) through its Deno entry. The file goes back
// through fileResponse (_shared/files.ts), whose Content-Type keeps it binary
// in the app.

import * as XLSX from 'https://esm.sh/xlsx@0.18.5'
import { denoPdf } from '../_shared/pdfDeno.ts'
import { withCors, json, callerClient } from '../_shared/http.ts'
import { fileResponse, statementFilename } from '../_shared/files.ts'
import { loadStatement, statementBytes } from './statementFile.ts'

interface Body {
  from: string
  to: string
  format: 'xlsx' | 'pdf'
}

Deno.serve(withCors(async (req) => {
  try {
    const { from, to, format = 'xlsx' } = (await req.json()) as Body
    const DATE = /^\d{4}-\d{2}-\d{2}$/
    if (!DATE.test(from ?? '') || !DATE.test(to ?? '')) {
      return json({ error: 'from and to must be dates (YYYY-MM-DD)' }, 400)
    }
    if (format !== 'xlsx' && format !== 'pdf') {
      return json({ error: 'format must be xlsx or pdf' }, 400)
    }

    const supabase = callerClient(req)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return json({ error: 'not authenticated' }, 401)
    // Per-caller quota (keyed on the caller's own uid server-side). Fails closed.
    const { data: allowed, error: quotaErr } = await supabase.rpc('consume_quota', { p_scope: 'report' })
    if (quotaErr) throw quotaErr
    if (allowed !== true) return json({ error: 'Too many report requests. Please try again later.' }, 429)

    const input = await loadStatement(supabase, { from, to })
    const bytes = await statementBytes(format, input, { pdf: denoPdf, xlsx: XLSX })
    return fileResponse(bytes, format, statementFilename(from, to, format))
  } catch (e) {
    console.error('generate-report error', e)
    return json({ error: 'Could not generate the report.' }, 500)
  }
}))
