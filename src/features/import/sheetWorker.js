// Parses an uploaded spreadsheet off the main thread, so a large or hostile
// file can't freeze the page. SheetJS is only ever loaded here, which also
// keeps it out of the main bundle.
import * as XLSX from 'xlsx'
import { parseSheet } from './sheetParse.js'

self.onmessage = (e) => {
  try {
    self.postMessage({ ok: true, ...parseSheet(XLSX, e.data) })
  } catch (err) {
    self.postMessage({ ok: false, message: err?.message || 'This spreadsheet couldn’t be read.' })
  }
}
