// The PDF toolkit's Deno entry (pdf.ts takes pdf-lib injected): pdf-lib and
// fontkit from esm.sh, at the versions package.json pins for the app, and the
// brand fonts from jsDelivr, fetched once per isolate. The app's own entry is
// src/shared/lib/pdf.js.

import { PDFDocument } from 'https://esm.sh/pdf-lib@1.17.1'
// @ts-expect-error esm.sh's types for fontkit declare no default export; the module has one.
import fontkit from 'https://esm.sh/@pdf-lib/fontkit@1.1.1'
import { cdnFontUrl, type FontRole } from './brandFonts.ts'
import type { PdfLib } from './pdf.ts'

const fontCache: Partial<Record<FontRole, ArrayBuffer | null>> = {}

async function fontBytes(role: FontRole): Promise<ArrayBuffer | null> {
  if (role in fontCache) return fontCache[role] ?? null
  try {
    const r = await fetch(cdnFontUrl(role))
    fontCache[role] = r.ok ? await r.arrayBuffer() : null
  } catch {
    fontCache[role] = null
  }
  return fontCache[role] ?? null
}

export const denoPdf: PdfLib = {
  create: () => PDFDocument.create(),
  fontkit,
  fontBytes,
}
