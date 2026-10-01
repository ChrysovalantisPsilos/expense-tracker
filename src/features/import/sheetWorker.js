// Parses an uploaded spreadsheet off the main thread, so a large or hostile
// file can't freeze the page. SheetJS is only ever loaded here (sheetRead.js),
// which also keeps it out of the main bundle. Only the key of parseSheet's
// own message goes back to the page, which words it in the user's language;
// anything else (a SheetJS exception) is logged here instead.
import { readStatement } from './sheetRead.js'

self.onmessage = (e) => {
  self.postMessage(readStatement(e.data, (err) => console.error('[import] spreadsheet parse failed:', err)))
}
