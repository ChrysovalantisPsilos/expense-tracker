// Shared brand-matched PDF toolkit for the statements (the personal
// statement and the group statement), built on the device by the app and,
// for one release, by the report edge functions as a fallback.
//
// Mirrors the in-app kit (src/app/theme.js, src/shared/ui/kit): the budgeer
// mark and wordmark, Poppins headings + Nunito Sans body, white rounded
// panels on sand hairlines, sand figure tiles, the "Where your money went"
// stacked bar and ranked category bars, settle-up transfer rows and quiet
// tables. Fonts are brandFonts.ts's TTFs, with DejaVu Sans as a Unicode
// fallback and Helvetica as the last resort. Every text draw degrades
// gracefully.
//
// No imports of pdf-lib here: the caller injects it (PdfLib below) together
// with a way to get the font bytes. The Deno entry (pdfDeno.ts) supplies
// pdf-lib from esm.sh and fetches the fonts from jsDelivr; the browser entry
// (src/shared/lib/pdf.js) supplies the npm build and the app's self-hosted
// copies. Colours are plain pdf-lib RGB values ({ type: 'RGB', … }, what
// pdf-lib's rgb() returns).

import { type FontRole } from './brandFonts.ts'
import { STATEMENT_TEXT } from './statementText.ts'

// The slice of pdf-lib the toolkit uses (structural, so both builds fit).
interface Color { type: 'RGB'; red: number; green: number; blue: number }
interface PDFFont { widthOfTextAtSize(text: string, size: number): number }
interface PDFPage {
  drawText(text: string, options: object): void
  drawSvgPath(path: string, options: object): void
  drawRectangle(options: object): void
  drawCircle(options: object): void
}
interface PDFDocument {
  addPage(size: [number, number]): PDFPage
  getPages(): PDFPage[]
  registerFontkit(fontkit: unknown): void
  embedFont(font: string | Uint8Array | ArrayBuffer, options?: object): Promise<PDFFont>
  save(): Promise<Uint8Array>
}
// What an entry point injects: pdf-lib's document factory, fontkit, and the
// bytes of one brand font (null when it can't be had: the toolkit then
// falls back, as it always has).
export interface PdfLib {
  create(): Promise<PDFDocument>
  fontkit: unknown
  fontBytes(role: FontRole): Promise<ArrayBuffer | Uint8Array | null>
}

// pdf-lib's StandardFonts names for the last-resort faces.
const HELVETICA = 'Helvetica'
const HELVETICA_BOLD = 'Helvetica-Bold'

const rgb = (red: number, green: number, blue: number): Color => ({ type: 'RGB', red, green, blue })

const hex = (h: string): Color => rgb(
  parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255,
)

// Light-mode kit tokens (theme.js semantic colours).
const BRAND = {
  coral: hex('#f95d38'), // brand.500
  accent: hex('#e2431f'), // brand.600 — accent.fg
  amber: hex('#fbb324'), // amber.400
  ink: hex('#242019'), // text.primary
  muted: hex('#7c6f59'), // text.muted
  line: hex('#e8e1d5'), // border.default
  subtle: hex('#f3efe7'), // bg.subtle (tiles, tracks)
  canvas: hex('#faf8f4'), // bg.canvas
  white: rgb(1, 1, 1),
  positive: hex('#2f7a45'), // status.positive
  negative: hex('#c2372b'), // status.negative
}

type Tone = 'default' | 'muted' | 'accent' | 'positive' | 'negative'
const TONE: Record<Tone, Color> = {
  default: BRAND.ink, muted: BRAND.muted, accent: BRAND.accent, positive: BRAND.positive, negative: BRAND.negative,
}

// Share-breakdown swatches, coral/amber first; "Other" is always muted sand
// (the hex values of kitMath.js SHARE_SWATCHES / OTHER_SWATCH).
const SWATCHES = ['#f95d38', '#fbb324', '#ffa088', '#d97a06', '#f6c453', '#c2703d', '#ef8a5a'].map(hex)
const swatch = (i: number, label: string) => (label === 'Other' ? BRAND.muted : SWATCHES[i % SWATCHES.length])

interface BrandFonts {
  head: PDFFont; headBold: PDFFont; body: PDFFont; bodyBold: PDFFont; uni: PDFFont | null
}
async function loadBrandFonts(pdf: PDFDocument, lib: PdfLib): Promise<BrandFonts> {
  pdf.registerFontkit(lib.fontkit)
  const helv = await pdf.embedFont(HELVETICA)
  const helvB = await pdf.embedFont(HELVETICA_BOLD)
  const embed = async (role: FontRole, fallback: PDFFont) => {
    let bytes: ArrayBuffer | Uint8Array | null = null
    try { bytes = await lib.fontBytes(role) } catch { /* unavailable: fall back */ }
    if (!bytes) return fallback
    try { return await pdf.embedFont(bytes, { subset: true }) } catch { return fallback }
  }
  const uni = await embed('uni', null as unknown as PDFFont) || null
  return {
    head: await embed('head', helvB),
    headBold: await embed('headBold', helvB),
    body: await embed('body', uni ?? helv),
    bodyBold: await embed('bodyBold', uni ?? helvB),
    uni: uni ?? null,
  }
}

// One character the brand fonts draw: Latin to Extended-B, general
// punctuation (’ “ ” – — … •), € and the minus sign.
const BRAND_CHARS = /^[\u0020-\u024F\u2000-\u206F\u20AC\u2212]$/

// Fold characters the brand fonts can't encode down to ASCII (last resort).
function asciiFold(s: string): string {
  return String(s)
    .replace(/[‘’‚]/g, "'").replace(/[“”„]/g, '"')
    .replace(/[→➡➔]/g, '->').replace(/←/g, '<-')
    .replace(/[–—−]/g, '-').replace(/…/g, '...').replace(/≈/g, '~')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '?')
}

export function money(n: number, cur?: string): string {
  const neg = n < 0
  const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${neg ? '-' : ''}${s}${cur ? ' ' + cur : ''}`
}

// An SVG path for a rectangle in screen space (y down) with per-corner radii
// [top-left, top-right, bottom-right, bottom-left].
function roundRect(x: number, y: number, w: number, h: number, r: number | number[]): string {
  const [tl, tr, br, bl] = (Array.isArray(r) ? r : [r, r, r, r]).map((v) => Math.max(0, Math.min(v, w / 2, h / 2)))
  return `M ${x + tl} ${y} H ${x + w - tr} A ${tr} ${tr} 0 0 1 ${x + w} ${y + tr} V ${y + h - br}`
    + ` A ${br} ${br} 0 0 1 ${x + w - br} ${y + h} H ${x + bl} A ${bl} ${bl} 0 0 1 ${x} ${y + h - bl}`
    + ` V ${y + tl} A ${tl} ${tl} 0 0 1 ${x + tl} ${y} Z`
}

// A stroked arc (screen space, degrees clockwise from 3 o'clock).
function arc(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const p = (a: number) => [cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180)]
  const [x0, y0] = p(a0)
  const [x1, y1] = p(a1)
  return `M ${x0} ${y0} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`
}

type Cell = string | { text: string; tone?: Tone; bold?: boolean }
interface Col { title: string; width: number; align?: 'left' | 'right' }
export interface Tile { label: string; value: string; tone?: Tone }

// A flowing, brand-styled A4 document. Coordinates are screen-space
// (y grows downward from the top); drawText's bottom-left origin is handled
// internally so callers think top-down.
export class Statement {
  pdf: PDFDocument
  f: BrandFonts
  page!: PDFPage
  W = 595.28
  H = 841.89
  M = 42
  y = 0
  get CW() { return this.W - this.M * 2 }

  constructor(pdf: PDFDocument, fonts: BrandFonts) {
    this.pdf = pdf
    this.f = fonts
    this.addPage()
  }

  // A new A4 statement, with the brand fonts embedded, on the injected pdf-lib.
  static async create(lib: PdfLib): Promise<Statement> {
    const pdf = await lib.create()
    return new Statement(pdf, await loadBrandFonts(pdf, lib))
  }

  addPage() {
    this.page = this.pdf.addPage([this.W, this.H])
    this.y = this.M
  }
  ensure(h: number) {
    if (this.y + h > this.H - 54) this.addPage()
  }

  // The brand fonts cover Latin (plus general punctuation, € and the minus
  // sign) and render anything else as blank boxes without throwing, so a
  // string is drawn in runs: brand font where it can, the Unicode face for the
  // rest (≈, →, non-Latin names).
  runs(str: string, font: PDFFont): { s: string; font: PDFFont }[] {
    const uni = this.f.uni
    if (!uni) return [{ s: str, font }]
    const out: { s: string; font: PDFFont }[] = []
    for (const ch of str) {
      const f = BRAND_CHARS.test(ch) ? font : uni
      const last = out[out.length - 1]
      if (last && last.font === f) last.s += ch
      else out.push({ s: ch, font: f })
    }
    return out
  }
  runWidth(s: string, font: PDFFont, size: number): number {
    try { return font.widthOfTextAtSize(s, size) }
    catch { return asciiFold(s).length * size * 0.5 }
  }

  // Draw a string with its top near screen-y `ty`; anything no face can
  // encode falls back to an ASCII fold.
  text(str: string, x: number, ty: number, opts: { size?: number; font?: PDFFont; color?: Color } = {}) {
    const size = opts.size ?? 10
    const color = opts.color ?? BRAND.ink
    const yb = this.H - ty - size
    let rx = x
    for (const run of this.runs(str, opts.font ?? this.f.body)) {
      try { this.page.drawText(run.s, { x: rx, y: yb, size, font: run.font, color }) }
      catch { this.page.drawText(asciiFold(run.s), { x: rx, y: yb, size, font: run.font, color }) }
      rx += this.runWidth(run.s, run.font, size)
    }
  }
  textRight(str: string, xRight: number, ty: number, opts: { size?: number; font?: PDFFont; color?: Color } = {}) {
    const size = opts.size ?? 10
    const font = opts.font ?? this.f.body
    this.text(str, xRight - this.width(str, font, size), ty, opts)
  }
  width(str: string, font: PDFFont, size: number): number {
    return this.runs(str, font).reduce((w, run) => w + this.runWidth(run.s, run.font, size), 0)
  }
  truncate(str: string, font: PDFFont, size: number, maxW: number): string {
    if (this.width(str, font, size) <= maxW) return str
    let s = str
    while (s.length > 1 && this.width(s + '…', font, size) > maxW) s = s.slice(0, -1)
    return s + '…'
  }
  // Greedy word wrap to `maxW`.
  wrap(str: string, font: PDFFont, size: number, maxW: number): string[] {
    const lines: string[] = []
    let line = ''
    for (const word of str.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word
      if (line && this.width(next, font, size) > maxW) { lines.push(line); line = word } else line = next
    }
    if (line) lines.push(line)
    return lines
  }

  fill(x: number, ty: number, w: number, h: number, color: Color, r: number | number[] = 0, border?: Color) {
    if (w <= 0 || h <= 0) return
    this.page.drawSvgPath(roundRect(x, ty, w, h, r), {
      x: 0, y: this.H, color, ...(border ? { borderColor: border, borderWidth: 0.8 } : { borderWidth: 0 }),
    })
  }
  dot(cx: number, cy: number, r: number, color: Color) {
    this.page.drawCircle({ x: cx, y: this.H - cy, size: r, color })
  }

  // The budgeer mark (public/budgeer-mark.svg) at `size`pt, top-left at (x, ty):
  // a lowercase b whose bowl is a budget ring, amber then coral.
  mark(x: number, ty: number, size: number) {
    const s = size / 48
    this.fill(x + 9.25 * s, ty + 3.6 * s, 7.5 * s, 29.4 * s, BRAND.coral, 3.75 * s)
    const cx = x + 24 * s
    const cy = ty + 29.6 * s
    const r = 11 * s
    const deg = (len: number) => (len / (2 * Math.PI * 11)) * 360 - 90
    const ring = (a0: number, a1: number, color: Color) =>
      this.page.drawSvgPath(arc(cx, cy, r, a0, a1), { x: 0, y: this.H, borderColor: color, borderWidth: 7.5 * s })
    ring(deg(0), deg(19), BRAND.amber)
    ring(deg(21), deg(69.2), BRAND.coral)
  }

  // Masthead: mark + wordmark (and whom it's for) on the left, the title and
  // its meta line on the right, over a sand band.
  header(title: string, meta: string, name?: string) {
    const bandH = 92
    this.page.drawRectangle({ x: 0, y: this.H - bandH, width: this.W, height: bandH, color: BRAND.canvas })
    this.page.drawRectangle({ x: 0, y: this.H - bandH, width: this.W, height: 0.8, color: BRAND.line })
    this.mark(this.M - 4, 26, 34)
    this.text('budgeer', this.M + 32, 31, { size: 20, font: this.f.headBold })
    if (name) {
      this.text(this.truncate(name, this.f.body, 9.5, 220), this.M, 66, { size: 9.5, color: BRAND.muted })
    }
    this.textRight(title, this.W - this.M, 30, { size: 16, font: this.f.head })
    this.textRight(meta, this.W - this.M, 55, { size: 9.5, color: BRAND.muted })
    this.y = bandH + 24
  }

  // A kit SectionLabel-style heading for content that flows across pages.
  sectionTitle(str: string, aside?: string) {
    this.ensure(56)
    this.y += 4
    this.text(str, this.M, this.y, { size: 13, font: this.f.head })
    if (aside) this.textRight(aside, this.M + this.CW, this.y + 3, { size: 9, color: BRAND.muted })
    this.y += 26
  }

  // A white rounded card with a title (and muted subtitle); `draw` fills
  // `contentH` points of content from (x, y) with width w.
  panel(opts: { title: string; subtitle?: string; contentH: number }, draw: (x: number, y: number, w: number) => void) {
    const pad = 18
    const headH = opts.subtitle ? 40 : 28
    const h = pad + headH + opts.contentH + pad
    this.ensure(h + 14)
    const top = this.y
    this.fill(this.M, top, this.CW, h, BRAND.white, 14, BRAND.line)
    this.text(opts.title, this.M + pad, top + pad, { size: 13, font: this.f.head })
    if (opts.subtitle) this.text(opts.subtitle, this.M + pad, top + pad + 19, { size: 9, color: BRAND.muted })
    draw(this.M + pad, top + pad + headH, this.CW - pad * 2)
    this.y = top + h + 14
  }

  // Figure tiles (kit Figure on a sand Tile): small muted label, big value.
  tiles(items: Tile[], opts: { columns?: number; size?: number; x?: number; y?: number; w?: number } = {}): number {
    const columns = opts.columns ?? items.length
    const size = opts.size ?? 16
    const gap = 10
    const x0 = opts.x ?? this.M
    const w = opts.w ?? this.CW
    const tw = (w - gap * (columns - 1)) / columns
    const th = size + 32
    const flowing = opts.y == null
    const y0 = opts.y ?? this.y
    if (flowing) this.ensure(Math.ceil(items.length / columns) * (th + gap) + 10)
    items.forEach((it, i) => {
      const x = x0 + (i % columns) * (tw + gap)
      const y = (flowing ? this.y : y0) + Math.floor(i / columns) * (th + gap)
      this.fill(x, y, tw, th, BRAND.subtle, 12)
      this.text(this.truncate(it.label, this.f.body, 8.5, tw - 24), x + 12, y + 10, { size: 8.5, color: BRAND.muted })
      const font = size >= 14 ? this.f.headBold : this.f.bodyBold
      this.text(this.truncate(it.value, font, size, tw - 24), x + 12, y + 23, {
        size, font, color: TONE[it.tone ?? 'default'],
      })
    })
    const h = Math.ceil(items.length / columns) * (th + gap) - gap
    if (flowing) this.y += h + 16
    return h
  }
  static tilesHeight(n: number, columns: number, size = 16) {
    return Math.ceil(n / columns) * (size + 32 + 10) - 10
  }

  // A sand note box with wrapped muted text (e.g. pending-rate notes).
  notes(lines: string[]) {
    if (lines.length === 0) return
    const size = 9
    const wrapped = lines.flatMap((l) => this.wrap(l, this.f.body, size, this.CW - 28))
    const h = wrapped.length * 13 + 18
    this.ensure(h + 14)
    this.fill(this.M, this.y, this.CW, h, BRAND.subtle, 12)
    wrapped.forEach((l, i) => this.text(l, this.M + 14, this.y + 9 + i * 13, { size, color: BRAND.muted }))
    this.y += h + 14
  }

  // "Where your money went": the kit StackedBar (segments with a 2pt gap in a
  // rounded track) over ranked category rows — swatch, name, amount, share and
  // a bar sized relative to the largest. `items` come from categoryBars.
  static breakdownHeight(n: number) { return 12 + 18 + n * 36 - 8 }
  breakdown(x: number, y: number, w: number, items: { name: string; meta: string; share: number; ratio: number }[]) {
    const bh = 12
    const gap = 2
    const usable = w - gap * (items.length - 1)
    this.fill(x, y, w, bh, BRAND.subtle, bh / 2)
    let sx = x
    items.forEach((it, i) => {
      const sw = (usable * it.share) / 100
      const first = i === 0
      const last = i === items.length - 1
      this.fill(sx, y, sw, bh, swatch(i, it.name), [first ? bh / 2 : 0, last ? bh / 2 : 0, last ? bh / 2 : 0, first ? bh / 2 : 0])
      sx += sw + gap
    })
    let ry = y + bh + 18
    items.forEach((it, i) => {
      const color = swatch(i, it.name)
      this.dot(x + 4, ry + 6, 4, color)
      const pct = `${it.share}%`
      const pctW = this.width(pct, this.f.bodyBold, 10)
      const metaW = this.width(it.meta, this.f.body, 9)
      this.text(this.truncate(it.name, this.f.bodyBold, 10, w - 16 - pctW - metaW - 24), x + 14, ry, { size: 10, font: this.f.bodyBold })
      this.textRight(pct, x + w, ry, { size: 10, font: this.f.bodyBold, color: BRAND.muted })
      this.textRight(it.meta, x + w - pctW - 12, ry + 1, { size: 9, color: BRAND.muted })
      const track = ry + 17
      this.fill(x + 14, track, w - 14, 6, BRAND.subtle, 3)
      this.fill(x + 14, track, Math.max((w - 14) * it.ratio, 6), 6, color, 3)
      ry += 36
    })
  }

  // Settle-up payments (kit TransferRow): from → to on a sand tile, amount in
  // accent on the right.
  static transfersHeight(n: number) { return n * 34 - 6 }
  transfers(x: number, y: number, w: number, items: { from: string; to: string; amount: string }[]) {
    items.forEach((t, i) => {
      const ty = y + i * 34
      this.fill(x, ty, w, 28, BRAND.subtle, 10)
      const aw = this.width(t.amount, this.f.bodyBold, 10.5)
      const nameW = (w - aw - 80) / 2
      let cx = x + 12
      const who = (name: string) => {
        this.dot(cx + 7, ty + 14, 7, BRAND.coral)
        const initial = (name.trim()[0] ?? '?').toUpperCase()
        this.text(initial, cx + 7 - this.width(initial, this.f.bodyBold, 7.5) / 2, ty + 9.5, { size: 7.5, font: this.f.bodyBold, color: BRAND.white })
        const shown = this.truncate(name, this.f.bodyBold, 10, nameW)
        this.text(shown, cx + 19, ty + 8, { size: 10, font: this.f.bodyBold })
        cx += 19 + this.width(shown, this.f.bodyBold, 10) + 8
      }
      who(t.from)
      this.text('→', cx, ty + 8, { size: 10, color: BRAND.muted })
      cx += 16
      who(t.to)
      this.textRight(t.amount, x + w - 12, ty + 8, { size: 10.5, font: this.f.bodyBold, color: BRAND.accent })
    })
  }

  // A quiet table: a sand header strip with small muted labels, hairlines
  // between rows; the header repeats on each new page.
  table(cols: Col[], rows: Cell[][]) {
    const xs: number[] = []
    let x = this.M
    for (const col of cols) { xs.push(x); x += col.width }
    const rowH = 21
    const headH = 22
    const drawHead = () => {
      this.fill(this.M, this.y, this.CW, headH, BRAND.subtle, 8)
      cols.forEach((col, i) => {
        const t = col.title.toUpperCase()
        const o = { size: 7.5, font: this.f.bodyBold, color: BRAND.muted }
        if (col.align === 'right') this.textRight(t, xs[i] + col.width - 10, this.y + 7.5, o)
        else this.text(t, xs[i] + 10, this.y + 7.5, o)
      })
      this.y += headH + 2
    }
    this.ensure(headH + rowH * 2)
    drawHead()
    rows.forEach((row, ri) => {
      if (this.y + rowH > this.H - 54) { this.addPage(); drawHead() }
      cols.forEach((col, i) => {
        const cell = row[i]
        const val = typeof cell === 'string' ? cell : cell.text
        const tone = typeof cell === 'string' ? 'default' : (cell.tone ?? 'default')
        const font = typeof cell !== 'string' && cell.bold ? this.f.bodyBold : this.f.body
        const shown = this.truncate(val, font, 9, col.width - 16)
        const o = { size: 9, font, color: TONE[tone] }
        if (col.align === 'right') this.textRight(shown, xs[i] + col.width - 10, this.y + 6, o)
        else this.text(shown, xs[i] + 10, this.y + 6, o)
      })
      this.y += rowH
      if (ri < rows.length - 1) this.page.drawRectangle({ x: this.M + 10, y: this.H - this.y, width: this.CW - 20, height: 0.6, color: BRAND.line })
    })
    this.y += 14
  }

  muted(str: string) {
    this.ensure(20)
    this.text(str, this.M, this.y, { size: 9.5, color: BRAND.muted })
    this.y += 22
  }

  // Footers on every page; then the document's bytes.
  save(footer = STATEMENT_TEXT.footer): Promise<Uint8Array> {
    const pages = this.pdf.getPages()
    const total = pages.length
    pages.forEach((p, i) => {
      this.page = p
      p.drawRectangle({ x: this.M, y: 40, width: this.CW, height: 0.8, color: BRAND.line })
      this.mark(this.M - 2, this.H - 34, 12)
      this.text(footer, this.M + 13, this.H - 31, { size: 8, color: BRAND.muted })
      this.textRight(`${i + 1} / ${total}`, this.M + this.CW, this.H - 31, { size: 8, color: BRAND.muted })
    })
    return this.pdf.save()
  }
}
