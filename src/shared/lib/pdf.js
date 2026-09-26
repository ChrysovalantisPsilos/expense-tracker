// The statement PDF toolkit's browser entry (supabase/functions/_shared/pdf.ts
// takes pdf-lib injected; the edge functions' entry is _shared/pdfDeno.ts).
// It hands the toolkit the npm pdf-lib and fontkit, and the brand fonts from
// the app's own origin (vite.config.js copies them there; the service worker
// keeps them after the first use, so a statement can be made offline). A font
// that can't be had leaves the toolkit on its fallback (DejaVu, then
// Helvetica), as on the server.
//
// Heavy (pdf-lib + fontkit): only ever loaded with import(), when a statement
// is exported.
import { PDFDocument } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { STATEMENT_FONT_DIR, fontPath } from '../../../supabase/functions/_shared/brandFonts.ts'

const fonts = new Map()

// One fetch per font per page load; a failed one is tried again next time.
function fontBytes(role) {
  if (!fonts.has(role)) {
    const bytes = fetch(`/${STATEMENT_FONT_DIR}/${fontPath(role)}`)
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .catch(() => null)
      .then((b) => {
        if (!b) fonts.delete(role)
        return b
      })
    fonts.set(role, bytes)
  }
  return fonts.get(role)
}

export const browserPdf = { create: () => PDFDocument.create(), fontkit, fontBytes }
