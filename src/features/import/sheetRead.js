// A statement file's bytes → its table, with SheetJS for real workbooks
// (sheetParse.parseSheet). The web runs it in the parsing worker
// (sheetWorker.js), so SheetJS stays out of the page's bundle; the native app
// runs it in its core. The answer is plain data either way:
//   { ok: true, headers, rows, lines }   (see parseSheet)
//   { ok: false, key }                   parseSheet's own message key (or
//                                        none for anything else), worded by
//                                        importText.readProblem
// `onError` hears about a failure that isn't parseSheet's own message (a
// SheetJS exception), for the worker's log.
import * as XLSX from 'xlsx'
import { parseSheet } from './sheetParse.js'
import { UserError } from '../../shared/lib/errors.js'

export function readStatement(bytes, onError = () => {}) {
  try {
    return { ok: true, ...parseSheet(XLSX, bytes) }
  } catch (err) {
    if (!(err instanceof UserError)) onError(err)
    return { ok: false, key: err instanceof UserError ? err.key : undefined }
  }
}
