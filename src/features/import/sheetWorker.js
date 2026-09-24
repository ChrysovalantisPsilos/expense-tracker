// Parses an uploaded spreadsheet off the main thread, so a large or hostile
// file can't freeze the page. SheetJS is only ever loaded here, which also
// keeps it out of the main bundle. Only parseSheet's own messages go back to
// the page; anything else (a SheetJS exception) is logged here instead.
import * as XLSX from 'xlsx'
import { parseSheet } from './sheetParse.js'
import { UserError, userMessage } from '../../shared/lib/errors.js'

self.onmessage = (e) => {
  try {
    self.postMessage({ ok: true, ...parseSheet(XLSX, e.data) })
  } catch (err) {
    if (!(err instanceof UserError)) console.error('[import] spreadsheet parse failed:', err)
    self.postMessage({ ok: false, message: userMessage(err, 'This spreadsheet couldn’t be read.') })
  }
}
