// Reading delimited-text bank exports (CSV / TSV / "Excel" files that are
// really text): container sniffing, character-set decoding and a strict
// RFC 4180 parser with delimiter sniffing. Every cell stays a string — the
// importer decides later, per column, whether "01/02/2026" is day- or
// month-first and whether "1.234" is a thousand or one. Pure module.

// What the bytes are, whatever the file is called: an .xlsx (zip), a legacy
// .xls (OLE2 compound file), an HTML table saved as .xls (common for bank
// "Excel" exports), or plain delimited text.
export function sniffContainer(bytes) {
  const b = bytes
  if (b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) return 'zip'
  if (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return 'ole'
  const head = decodeText(b.subarray(0, 512)).text.trimStart().slice(0, 64).toLowerCase()
  if (head.startsWith('<')) return 'html'
  return 'text'
}

// Decode text bytes: BOM first (UTF-8, UTF-16 LE/BE), then strict UTF-8, then
// a single-byte code page. Greek exports from Windows Excel are cp1253
// (identical to ISO-8859-7 for every Greek letter); Western ones cp1252. A run
// of three or more high bytes in a row is a Greek word — French/Dutch text
// only has isolated accented letters between ASCII ones.
export function decodeText(bytes) {
  const b = bytes
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return { text: new TextDecoder('utf-8').decode(b.subarray(3)), encoding: 'utf-8-bom' }
  if (b[0] === 0xff && b[1] === 0xfe) return { text: new TextDecoder('utf-16le').decode(b.subarray(2)), encoding: 'utf-16le' }
  if (b[0] === 0xfe && b[1] === 0xff) return { text: new TextDecoder('utf-16be').decode(b.subarray(2)), encoding: 'utf-16be' }
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(b), encoding: 'utf-8' }
  } catch {
    const encoding = looksGreek(b) ? 'windows-1253' : 'windows-1252'
    return { text: new TextDecoder(encoding).decode(b), encoding }
  }
}

function looksGreek(b) {
  let runs = 0
  let run = 0
  for (let i = 0; i < b.length && runs < 3; i++) {
    if (b[i] >= 0xc1 && b[i] <= 0xfe) {
      run++
      if (run === 3) runs++
    } else {
      run = 0
    }
  }
  return runs >= 3
}

const DELIMITERS = [';', ',', '\t', '|']

// Pick the delimiter that splits the most lines into the same number of
// fields. Preamble lines ("Account: …") and decimal commas ("12,50") vary per
// line, so consistency beats raw counts. Excel's "sep=;" hint wins outright.
export function sniffDelimiter(text) {
  const hint = /^sep=(.)\r?\n/i.exec(text)
  if (hint) return hint[1]
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim()).slice(0, 40)
  let best = ','
  let bestScore = 0
  for (const d of DELIMITERS) {
    const counts = lines.map((l) => countOutsideQuotes(l, d)).filter((n) => n > 0)
    if (!counts.length) continue
    const freq = new Map()
    for (const n of counts) freq.set(n, (freq.get(n) ?? 0) + 1)
    const [mode, hits] = [...freq].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]
    const score = hits * 10 + Math.min(mode, 9)
    if (score > bestScore) { best = d; bestScore = score }
  }
  return best
}

function countOutsideQuotes(line, d) {
  let n = 0
  let quoted = false
  for (const ch of line) {
    if (ch === '"') quoted = !quoted
    else if (ch === d && !quoted) n++
  }
  return n
}

// RFC 4180: quoted fields may hold the delimiter, newlines and "" escapes.
// Returns an array of rows (arrays of strings); blank lines are dropped.
export function parseDelimited(text, delimiter = sniffDelimiter(text)) {
  let src = text
  const hint = /^sep=.\r?\n/i.exec(src)
  if (hint) src = src.slice(hint[0].length)
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  let i = 0
  const endRow = () => {
    row.push(field)
    if (row.some((c) => c.trim() !== '')) rows.push(row)
    row = []
    field = ''
  }
  while (i < src.length) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 2; continue }
        quoted = false
      } else {
        field += ch
      }
      i++
      continue
    }
    if (ch === '"' && field.trim() === '') { quoted = true; field = ''; i++; continue }
    if (ch === delimiter) { row.push(field); field = ''; i++; continue }
    if (ch === '\r' || ch === '\n') {
      endRow()
      i += ch === '\r' && src[i + 1] === '\n' ? 2 : 1
      continue
    }
    field += ch
    i++
  }
  if (field !== '' || row.length) endRow()
  return rows
}
