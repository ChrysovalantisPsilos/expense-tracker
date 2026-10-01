// On-device receipt OCR (Tesseract.js); the merchant, date, total and
// currency are then read from its text (receiptRead.js).
//
// Notes:
//  * Tesseract runs entirely in the browser. Its worker, wasm core and the
//    English + Greek trained data are served from our own origin
//    (vite.config.js copies them out of node_modules into OCR_ASSET_DIR),
//    never from a CDN. They stay out of the service-worker precache and are
//    only fetched when someone scans (Tesseract then keeps the language data
//    in IndexedDB). The photo itself is never uploaded or stored.
//  * The image is cleaned up first (receiptImage.js): upright, cropped,
//    downscaled, grayscale, contrast-stretched and binarised.
//  * Reading the text is pure (receiptRead.js, the native app's too); the
//    user confirms (and can correct) what was read before it fills a form.
import { readReceipt } from './receiptRead.js'

// Build-output folder for the OCR engine files; vite.config.js writes it.
export const OCR_ASSET_DIR = 'tesseract'
// English + Greek: receipts in Cyprus/Greece mix both scripts.
const OCR_LANGS = 'eng+ell'

// Absolute same-origin URLs for Tesseract's worker, core and language data.
// Absolute because the worker boots from a blob: URL, where relative paths
// don't resolve. corePath is a folder: Tesseract picks the SIMD or plain
// LSTM core inside it for the device.
export function ocrPaths(origin) {
  const base = `${origin}/${OCR_ASSET_DIR}`
  return { workerPath: `${base}/worker.min.js`, corePath: `${base}/core`, langPath: `${base}/lang` }
}

// Run OCR on a prepared canvas. onProgress receives 0..1. Returns the raw
// text. Tesseract is imported dynamically so it only loads when the user
// actually scans (keeps the initial bundle small). Page segmentation 4 (one
// column of variable-size text) suits receipts better than the default.
async function ocrImage(image, onProgress) {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker(OCR_LANGS, 1, {
    ...ocrPaths(window.location.origin),
    logger: (m) => {
      if (m.status === 'recognizing text' && onProgress) onProgress(m.progress)
    },
  })
  try {
    await worker.setParameters({ tessedit_pageseg_mode: '4', preserve_interword_spaces: '1' })
    const { data } = await worker.recognize(image)
    return data.text || ''
  } finally {
    await worker.terminate()
  }
}

// OCR a prepared image, then extract the fields.
export async function scanReceipt(image, onProgress) {
  const text = await ocrImage(image, onProgress)
  return { ...readReceipt(text), text }
}
