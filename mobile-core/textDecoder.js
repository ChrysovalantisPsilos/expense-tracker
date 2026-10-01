// TextDecoder for the core, where the engine has none: JavaScriptCore (a bare
// JSContext) gives the language's own globals only, and the statement
// import's decodeText (statementText.js) needs the five encodings bank
// exports come in. Installed on globalThis by index.js before any module runs,
// only when the engine lacks one; test/mobileCoreText.test.js holds it to the
// browser's (Node's) decoder, byte for byte.
//
// utf-8 (strict with { fatal: true }), utf-16le, utf-16be, windows-1252 and
// windows-1253, as the Encoding Standard decodes them: a leading byte-order
// mark of the encoding dropped, anything malformed U+FFFD (or, fatal, a
// TypeError).

const hex = (list) => list.split(' ').map((h) => parseInt(h, 16))
// Bytes 0x80–0xFF of each single-byte code page.
const SINGLE = {
  'windows-1252': [
    ...hex('20ac 81 201a 192 201e 2026 2020 2021 2c6 2030 160 2039 152 8d 17d 8f 90 2018 2019 201c 201d 2022 2013 2014 2dc 2122 161 203a 153 9d 17e 178'),
    ...Array.from({ length: 96 }, (_, i) => 0xa0 + i),
  ],
  'windows-1253': hex('20ac 81 201a 192 201e 2026 2020 2021 88 2030 8a 2039 8c 8d 8e 8f 90 2018 2019 201c 201d 2022 2013 2014 98 2122 9a 203a 9c 9d 9e 9f '
    + 'a0 385 386 a3 a4 a5 a6 a7 a8 a9 aa ab ac ad ae 2015 b0 b1 b2 b3 384 b5 b6 b7 388 389 38a bb 38c bd 38e 38f '
    + '390 391 392 393 394 395 396 397 398 399 39a 39b 39c 39d 39e 39f 3a0 3a1 fffd 3a3 3a4 3a5 3a6 3a7 3a8 3a9 3aa 3ab 3ac 3ad 3ae 3af '
    + '3b0 3b1 3b2 3b3 3b4 3b5 3b6 3b7 3b8 3b9 3ba 3bb 3bc 3bd 3be 3bf 3c0 3c1 3c2 3c3 3c4 3c5 3c6 3c7 3c8 3c9 3ca 3cb 3cc 3cd 3ce fffd'),
}
const LABELS = {
  'utf-8': 'utf-8', utf8: 'utf-8', 'utf-16le': 'utf-16le', 'utf-16be': 'utf-16be',
  'windows-1252': 'windows-1252', 'windows-1253': 'windows-1253',
}

// Code points → a string, in slices (a long file would overflow the call stack).
function text(points) {
  let out = ''
  for (let i = 0; i < points.length; i += 0x2000) out += String.fromCodePoint(...points.slice(i, i + 0x2000))
  return out
}

// The Encoding Standard's UTF-8 decoder: each malformed sequence (its
// maximal subpart) is one U+FFFD.
function utf8(b, fatal) {
  const out = []
  let needed = 0
  let seen = 0
  let point = 0
  let lower = 0x80
  let upper = 0xbf
  const bad = () => {
    if (fatal) throw new TypeError('The encoded data was not valid for encoding utf-8')
    out.push(0xfffd)
  }
  for (let i = 0; i < b.length; i++) {
    const byte = b[i]
    if (needed === 0) {
      if (byte <= 0x7f) out.push(byte)
      else if (byte >= 0xc2 && byte <= 0xdf) { needed = 1; point = byte & 0x1f }
      else if (byte >= 0xe0 && byte <= 0xef) {
        if (byte === 0xe0) lower = 0xa0
        if (byte === 0xed) upper = 0x9f
        needed = 2
        point = byte & 0xf
      } else if (byte >= 0xf0 && byte <= 0xf4) {
        if (byte === 0xf0) lower = 0x90
        if (byte === 0xf4) upper = 0x8f
        needed = 3
        point = byte & 0x7
      } else bad()
      continue
    }
    if (byte < lower || byte > upper) {
      point = 0; needed = 0; seen = 0; lower = 0x80; upper = 0xbf
      bad()
      i-- // the byte starts again
      continue
    }
    lower = 0x80
    upper = 0xbf
    point = (point << 6) | (byte & 0x3f)
    if (++seen === needed) {
      out.push(point)
      point = 0; needed = 0; seen = 0
    }
  }
  if (needed) bad()
  if (out[0] === 0xfeff) out.shift()
  return text(out)
}

function utf16(b, littleEndian, fatal) {
  const out = []
  const bad = () => {
    if (fatal) throw new TypeError('The encoded data was not valid for encoding utf-16')
    out.push(0xfffd)
  }
  let lead = null
  const end = b.length - (b.length % 2)
  for (let i = 0; i < end; i += 2) {
    const unit = littleEndian ? b[i] | (b[i + 1] << 8) : (b[i] << 8) | b[i + 1]
    if (lead !== null) {
      if (unit >= 0xdc00 && unit <= 0xdfff) {
        out.push(0x10000 + ((lead - 0xd800) << 10) + (unit - 0xdc00))
        lead = null
        continue
      }
      lead = null
      bad()
    }
    if (unit >= 0xd800 && unit <= 0xdbff) lead = unit
    else if (unit >= 0xdc00 && unit <= 0xdfff) bad()
    else out.push(unit)
  }
  if (lead !== null || end !== b.length) bad()
  if (out[0] === 0xfeff) out.shift()
  return text(out)
}

export class TextDecoder {
  constructor(label = 'utf-8', { fatal = false } = {}) {
    const encoding = LABELS[String(label).trim().toLowerCase()]
    if (!encoding) throw new RangeError(`The "${label}" encoding is not supported`)
    this.encoding = encoding
    this.fatal = !!fatal
  }

  decode(input = new Uint8Array(0)) {
    const b = input instanceof Uint8Array ? input : new Uint8Array(input.buffer ?? input)
    if (this.encoding === 'utf-8') return utf8(b, this.fatal)
    if (this.encoding === 'utf-16le') return utf16(b, true, this.fatal)
    if (this.encoding === 'utf-16be') return utf16(b, false, this.fatal)
    const table = SINGLE[this.encoding]
    const out = new Array(b.length)
    for (let i = 0; i < b.length; i++) out[i] = b[i] < 0x80 ? b[i] : table[b[i] - 0x80]
    if (this.fatal && out.includes(0xfffd)) throw new TypeError(`The encoded data was not valid for encoding ${this.encoding}`)
    return text(out)
  }
}

if (typeof globalThis.TextDecoder === 'undefined') globalThis.TextDecoder = TextDecoder
