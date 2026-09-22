// On-device receipt OCR (Tesseract.js) + heuristic extraction of total + date.
//
// Notes:
//  * Tesseract runs entirely in the browser. Its worker, wasm core and English
//    trained data are served from our own origin (vite.config.js copies them
//    out of node_modules into OCR_ASSET_DIR), never from a CDN. They stay out
//    of the service-worker precache, so they're only fetched when someone scans.
//  * We only extract the total amount and the date — the two fields the user
//    confirmed as the scope. Merchant/category stay manual.

// Build-output folder for the OCR engine files; vite.config.js writes it.
export const OCR_ASSET_DIR = 'tesseract'

// Absolute same-origin URLs for Tesseract's worker, core and language data.
// Absolute because the worker boots from a blob: URL, where relative paths
// don't resolve. corePath is a folder: Tesseract picks the SIMD or plain
// LSTM core inside it for the device.
export function ocrPaths(origin) {
  const base = `${origin}/${OCR_ASSET_DIR}`
  return { workerPath: `${base}/worker.min.js`, corePath: `${base}/core`, langPath: `${base}/lang` }
}

// Run OCR. onProgress receives 0..1. Returns the raw recognized text.
// Tesseract is imported dynamically so its ~hundreds of KB only load when the
// user actually scans (keeps the initial bundle small). Internal to this module;
// scanReceipt is the public entry point. extractTotal/extractDate stay exported
// because they're pure and unit-tested.
async function ocrImage(file, onProgress) {
  const { default: Tesseract } = await import('tesseract.js')
  const { data } = await Tesseract.recognize(file, 'eng', {
    ...ocrPaths(window.location.origin),
    logger: (m) => {
      if (m.status === 'recognizing text' && onProgress) onProgress(m.progress)
    },
  })
  return data.text || ''
}

// Pull the most likely total from receipt text.
// Strategy: prefer a number on a line mentioning total/amount/balance; else
// fall back to the largest money-shaped number on the receipt.
export function extractTotal(text) {
  const lines = text.split(/\r?\n/)
  const moneyRe = /(?:[$€£]\s*)?(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})|\d+[.,]\d{2})/g
  const toNumber = (s) => {
    // Normalize "1.234,56" and "1,234.56" -> 1234.56
    let t = s.replace(/[^\d.,]/g, '')
    if (t.includes('.') && t.includes(',')) {
      t = t.lastIndexOf(',') > t.lastIndexOf('.')
        ? t.replace(/\./g, '').replace(',', '.')
        : t.replace(/,/g, '')
    } else if ((t.match(/,/g) || []).length === 1 && /,\d{2}$/.test(t)) {
      t = t.replace(',', '.')
    } else {
      t = t.replace(/,/g, '')
    }
    const n = parseFloat(t)
    return Number.isFinite(n) ? n : null
  }

  // 1) keyword lines (skip subtotal to avoid grabbing the wrong one)
  const keyword = /(grand\s*total|total\s*(?:due|amount)?|amount\s*due|balance)/i
  const negative = /sub\s*total/i
  let best = null
  for (const line of lines) {
    if (!keyword.test(line) || negative.test(line)) continue
    const matches = [...line.matchAll(moneyRe)].map((m) => toNumber(m[1])).filter((n) => n != null)
    if (matches.length) best = Math.max(best ?? 0, matches[matches.length - 1])
  }
  if (best != null) return best

  // 2) fallback: largest money-shaped number anywhere
  const all = [...text.matchAll(moneyRe)].map((m) => toNumber(m[1])).filter((n) => n != null)
  return all.length ? Math.max(...all) : null
}

// Pull a date (returns YYYY-MM-DD or null). Handles common numeric formats and
// a few month-name forms; assumes day-first when ambiguous but clamps sanely.
export function extractDate(text) {
  const iso = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/)
  if (iso) return clamp(+iso[1], +iso[2], +iso[3])

  const dmy = text.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2}|\d{2})\b/)
  if (dmy) {
    let [, a, b, y] = dmy
    let year = +y < 100 ? 2000 + +y : +y
    let d = +a, mo = +b
    if (d > 12 && mo <= 12) { /* already d/m */ }
    else if (mo > 12 && d <= 12) { [d, mo] = [mo, d] } // was m/d
    return clamp(year, mo, d)
  }

  const months = 'jan feb mar apr may jun jul aug sep oct nov dec'.split(' ')
  const named = text.match(new RegExp(`\\b(\\d{1,2})\\s*(${months.join('|')})[a-z]*\\.?\\s*(20\\d{2})`, 'i'))
  if (named) {
    const mo = months.indexOf(named[2].toLowerCase().slice(0, 3)) + 1
    return clamp(+named[3], mo, +named[1])
  }
  return null
}

function clamp(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  const pad = (n) => String(n).padStart(2, '0')
  return `${y}-${pad(m)}-${pad(d)}`
}

// Convenience: OCR then extract both fields.
export async function scanReceipt(file, onProgress) {
  const text = await ocrImage(file, onProgress)
  return { total: extractTotal(text), date: extractDate(text), text }
}
