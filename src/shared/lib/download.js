// Saving server-generated files (report PDFs / spreadsheets) in the browser.
// fileStem and toBlob are pure (unit-tested); saveBlob touches the DOM.

// A filename-safe stem: runs of anything but ASCII letters/digits become a
// single '-', trimmed at the ends; falls back when nothing is left.
export function fileStem(name, fallback = 'file') {
  const stem = String(name ?? '').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '')
  return stem || fallback
}

// Normalise an edge-function response body to a Blob of `type`. supabase-js
// hands back a Blob for binary responses (a spreadsheet arrives as
// octet-stream: see supabase/functions/_shared/files.ts), which is re-typed
// when it differs; anything else is wrapped (plain objects as JSON, so an
// unexpected JSON body is still inspectable rather than "[object Object]").
export function toBlob(data, type) {
  if (data instanceof Blob) return !type || data.type === type ? data : new Blob([data], { type })
  const part = data !== null && typeof data === 'object' && !ArrayBuffer.isView(data)
    && !(data instanceof ArrayBuffer)
    ? JSON.stringify(data)
    : data
  return new Blob([part], type ? { type } : undefined)
}

// Trigger a download of `blob` as `filename`.
export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
