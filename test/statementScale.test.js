// Long statements (thousands of bank-imported rows) in the PDF toolkit
// (supabase/functions/_shared/pdf.ts). A table cell too wide for its column
// was once cut one character at a time, each try measured afresh by fontkit:
// ~140 measurements a row, minutes for an 18-month account on a phone. Now
// each row takes a handful, whatever its length, and every cut is exactly
// where the one-character-at-a-time search makes it. Node strips the types.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PDFDocument } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { Statement } from '../supabase/functions/_shared/pdf.ts'
import { fontPath } from '../supabase/functions/_shared/brandFonts.ts'
import { loadStatement, statementBytes } from '../supabase/functions/generate-report/statementFile.ts'
import { LONG_FROM, LONG_TO, fakeSupabase, longAccount } from './statementFixtures.js'

// pdf-lib with the brand fonts from node_modules (package.json pins the
// versions brandFonts.ts names), counting every width measurement.
function countingPdf() {
  const counter = { widths: 0 }
  const lib = {
    create: async () => {
      const pdf = await PDFDocument.create()
      const embed = pdf.embedFont.bind(pdf)
      pdf.embedFont = async (...args) => {
        const font = await embed(...args)
        const measure = font.widthOfTextAtSize.bind(font)
        font.widthOfTextAtSize = (s, size) => { counter.widths++; return measure(s, size) }
        return font
      }
      return pdf
    },
    fontkit,
    fontBytes: async (role) =>
      readFileSync(new URL(`../node_modules/${fontPath(role).replace(/@\d[\w.-]*/, '')}`, import.meta.url)),
  }
  return { lib, counter }
}

// The cut as it was always made: one character shorter at a time.
function linearTruncate(doc, str, font, size, maxW) {
  if (doc.width(str, font, size) <= maxW) return str
  let s = str
  while (s.length > 1 && doc.width(s + '…', font, size) > maxW) s = s.slice(0, -1)
  return s + '…'
}

// A toolkit on stand-in fonts (`fonts`: role → widthOfTextAtSize).
function stubStatement(fonts) {
  const page = { drawText: () => {}, drawSvgPath: () => {}, drawRectangle: () => {}, drawCircle: () => {} }
  const face = (measure) => measure && { widthOfTextAtSize: measure }
  return new Statement({ addPage: () => page, getPages: () => [page] }, {
    head: face(fonts.body), headBold: face(fonts.body), body: face(fonts.body), bodyBold: face(fonts.body),
    uni: face(fonts.uni) ?? null,
  })
}

test('a long statement: a handful of measurements per row, and each page reported', async () => {
  const input = await loadStatement(fakeSupabase({ txns: longAccount(600) }), { from: LONG_FROM, to: LONG_TO })
  const rows = input.stmt.rows.length
  assert.ok(rows > 500)
  assert.ok(input.stmt.rows.filter((r) => r.description.length > 80).length > 200)
  const { lib, counter } = countingPdf()
  const pages = []
  const bytes = await statementBytes('pdf', input, { pdf: { ...lib, onPage: (p) => pages.push(p) } })
  // Cut one character at a time, this was ~140 a row.
  assert.ok(counter.widths < rows * 8, `${counter.widths} measurements for ${rows} rows`)
  const pdf = await PDFDocument.load(bytes)
  assert.deepEqual(pages, Array.from({ length: pdf.getPageCount() }, (_, i) => i + 1))
})

test('truncate: the same cut as one character at a time, in every face', async () => {
  const doc = await Statement.create(countingPdf().lib)
  const strings = [
    ...longAccount(12).map((r) => r.description),
    'Καφές και γλυκά στη Λισαβόνα με φίλους και οικογένεια',
    'office fluff affinity ffi ffl Straße AßA col·lecció',
    'Привет, мир — счёт за электричество',
    'Trip → Λισαβόνα ≈ 1,234.56 € − 12 …',
    'مرحبا بالعالم العربي مرحبا',
    '日本語のテキストと絵文字 🎉🎉',
    'x',
    '',
  ]
  let cases = 0
  for (const font of Object.values(doc.f)) {
    for (const [size, maxW] of [[9, 60], [9, 210], [9.5, 4], [13, 150]]) {
      for (const s of strings) {
        assert.equal(doc.truncate(s, font, size, maxW), linearTruncate(doc, s, font, size, maxW), `${s} @ ${size}/${maxW}`)
        cases++
      }
    }
  }
  assert.equal(cases, 5 * 4 * strings.length)
})

test('truncate: text whose width can shrink as it grows is still cut one character at a time', () => {
  // Arabic letters join, and a letter's final form can be wider than its
  // middle one: a stand-in face where a prefix ending in "ب" is wider than a
  // longer one.
  const shrinking = (s, size) => ([...s].length + (/ب…?$/.test(s) ? 6 : 0)) * size * 0.1
  const doc = stubStatement({ body: shrinking, uni: shrinking })
  for (const s of ['ابابابابابابابابابابابابابابابابابابابابابابابابابابابابا', 'بببببب ااااااا بببب']) {
    for (const maxW of [3, 5.4, 7, 12, 20]) {
      assert.equal(doc.truncate(s, doc.f.body, 9, maxW), linearTruncate(doc, s, doc.f.body, 9, maxW))
    }
  }
  // Nor where no face can measure it (Helvetica meets "é": the ASCII-fold guess).
  const helvetica = (s, size) => {
    if (/[^\x20-\x7E]/.test(s)) throw new Error('WinAnsi cannot encode')
    return [...s].length * size * 0.9
  }
  const plain = stubStatement({ body: helvetica })
  for (const maxW of [10, 30, 50, 70]) {
    const s = 'WWWWWWWWWWWWWW café au lait WWWWWW'
    assert.equal(plain.truncate(s, plain.f.body, 9, maxW), linearTruncate(plain, s, plain.f.body, 9, maxW))
  }
})

test('widths: kept per face and size, the same numbers pdf-lib gives', async () => {
  const { lib, counter } = countingPdf()
  const doc = await Statement.create(lib)
  const s = 'CARD PURCHASE LIDL HELLAS ATHENS'
  const direct = doc.f.body.widthOfTextAtSize(s, 9)
  const before = counter.widths
  assert.equal(doc.width(s, doc.f.body, 9), direct)
  assert.equal(doc.width(s, doc.f.body, 9), direct)
  assert.equal(counter.widths, before + 1)
  assert.notEqual(doc.width(s, doc.f.body, 10), direct)
  assert.notEqual(doc.width(s, doc.f.bodyBold, 9), direct)
  assert.equal(counter.widths, before + 3)
})
