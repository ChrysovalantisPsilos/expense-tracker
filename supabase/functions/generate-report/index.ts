// Supabase Edge Function: generate-report
//
// Builds a "full financial statement" for the calling user over a date range
// and returns it as an .xlsx or .pdf file.
//
//   POST /functions/v1/generate-report
//   body: { from: "2026-01-01", to: "2026-01-31", format: "xlsx" | "pdf" }
//
// Auth: verify_jwt = true (see supabase/config.toml). We read the caller's
// JWT, create a Supabase client scoped to that user so RLS applies, and pull
// only their transactions. No service-role key is used, so the function can
// never leak another user's data.
//
// Excel is generated with SheetJS (multi-sheet). PDF is a brand-matched
// statement (coral header, Poppins/Nunito Sans, stat cards, category pie,
// striped table) built with pdf-lib. Both run in Deno.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as XLSX from 'https://esm.sh/xlsx@0.18.5'
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1'
import fontkit from 'https://esm.sh/@pdf-lib/fontkit@1.1.1'

interface Body {
  from: string
  to: string
  format: 'xlsx' | 'pdf'
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'CLP'])
const minorFactor = (c: string) => (ZERO_DECIMAL.has(c) ? 1 : 100)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { from, to, format = 'xlsx' } = (await req.json()) as Body
    const DATE = /^\d{4}-\d{2}-\d{2}$/
    if (!DATE.test(from ?? '') || !DATE.test(to ?? '')) {
      return json({ error: 'from and to must be dates (YYYY-MM-DD)' }, 400)
    }
    if (format !== 'xlsx' && format !== 'pdf') {
      return json({ error: 'format must be xlsx or pdf' }, 400)
    }

    // Scope the client to the caller's JWT so RLS restricts rows to this user.
    const authHeader = req.headers.get('Authorization') ?? ''
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return json({ error: 'not authenticated' }, 401)
    const { data: allowed } = await supabase.rpc('rate_limit', { p_key: `report:${user.id}`, p_max: 30, p_seconds: 3600 })
    if (allowed === false) return json({ error: 'Too many report requests. Please try again later.' }, 429)

    const { data: profile } = await supabase.from('profiles').select('base_currency, display_name').single()
    const base = profile?.base_currency ?? 'USD'

    const { data: txns, error } = await supabase
      .from('transactions')
      .select('spent_at, kind, amount_minor, currency, exchange_rate, description, group_expense_id, categories(name), group_expenses(groups(name))')
      .gte('spent_at', from)
      .lte('spent_at', to)
      .order('spent_at', { ascending: true })
    if (error) throw error

    const rows = (txns ?? []).map((t) => {
      const sf = minorFactor(t.currency) // source decimal factor (JPY=1, else 100)
      // Mirrored group expenses bucket under their group's name; everything else
      // uses its category (matching the in-app breakdown).
      const category = t.group_expense_id
        ? (t.group_expenses?.groups?.name ?? 'Group')
        : (t.categories?.name ?? 'Uncategorized')
      return {
        date: t.spent_at,
        kind: t.kind,
        category,
        description: t.description ?? '',
        currency: t.currency,
        amount: t.amount_minor / sf,
        // rate is major-per-major, so divide source minor by its own factor first.
        base_amount: (t.amount_minor / sf) * Number(t.exchange_rate),
      }
    })

    const totalSpent = rows.filter((r) => r.kind === 'expense').reduce((s, r) => s + r.base_amount, 0)
    const totalIncome = rows.filter((r) => r.kind === 'income').reduce((s, r) => s + r.base_amount, 0)

    const byCategory: Record<string, number> = {}
    for (const r of rows.filter((r) => r.kind === 'expense')) {
      byCategory[r.category] = (byCategory[r.category] ?? 0) + r.base_amount
    }

    if (format === 'pdf') {
      const bytes = await buildPdf({ from, to, base, rows, totalSpent, totalIncome, byCategory, name: profile?.display_name })
      return new Response(bytes, {
        headers: { ...cors, 'Content-Type': 'application/pdf' },
      })
    }

    const bytes = buildXlsx({ base, rows, totalSpent, totalIncome, byCategory })
    return new Response(bytes, {
      headers: { ...cors, 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    })
  } catch (e) {
    console.error('generate-report error', e)
    return json({ error: 'Could not generate the report.' }, 500)
  }
})

// Neutralise spreadsheet formula injection: cells starting with a formula
// trigger are prefixed with an apostrophe so Excel/Sheets treat them as text.
function safeCell(v: unknown) {
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(v)) return `'${v}`
  return v
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

function buildXlsx({ base, rows, totalSpent, totalIncome, byCategory }: any): Uint8Array {
  const wb = XLSX.utils.book_new()

  // Summary sheet
  const summary = [
    ['Financial Statement'],
    ['Base currency', base],
    [],
    ['Total income', totalIncome],
    ['Total expenses', totalSpent],
    ['Net', totalIncome - totalSpent],
    [],
    ['Spending by category'],
    ...Object.entries(byCategory).sort((a: any, b: any) => b[1] - a[1])
      .map(([k, v]) => [safeCell(k), v]),
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), 'Summary')

  // Transactions sheet
  const txnSheet = XLSX.utils.json_to_sheet(
    rows.map((r: any) => ({
      Date: r.date, Type: r.kind, Category: safeCell(r.category), Description: safeCell(r.description),
      Currency: r.currency, Amount: r.amount, [`Amount (${base})`]: r.base_amount,
    })),
  )
  XLSX.utils.book_append_sheet(wb, txnSheet, 'Transactions')

  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }))
}

async function buildPdf(
  { from, to, base, rows, totalSpent, totalIncome, byCategory, name }: any,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const fonts = await loadBrandFonts(pdf)
  const doc = new Statement(pdf, fonts)

  doc.header('Financial statement', `${from}  →  ${to}   ·   ${base}`, name)

  // ── Summary stat cards ────────────────────────────────────────────────
  const net = totalIncome - totalSpent
  doc.statCards([
    { label: 'Income', value: money(totalIncome, base), color: BRAND.green },
    { label: 'Expenses', value: money(totalSpent, base), color: BRAND.coral },
    { label: 'Net', value: money(net, base), color: net < 0 ? BRAND.red : BRAND.ink },
  ])

  // ── Spending by category (pie + legend) ───────────────────────────────
  const cats = Object.entries(byCategory)
    .map(([label, value]) => ({ label, value: Number(value) }))
    .sort((a, b) => b.value - a.value)
  if (cats.length > 0 && totalSpent > 0) {
    doc.sectionTitle('Spending by category')
    doc.pie(cats, totalSpent, base)
  }

  // ── Transactions table ────────────────────────────────────────────────
  doc.sectionTitle('Transactions')
  if (rows.length === 0) {
    doc.muted('No transactions in this period.')
  } else {
    doc.table(
      [
        { title: 'Date', width: 70 },
        { title: 'Category', width: 110 },
        { title: 'Description', width: 175 },
        { title: `Amount (${base})`, width: 90, align: 'right' },
      ],
      rows.map((r: any) => [
        r.date,
        r.category,
        r.description || '—',
        { text: money(r.base_amount, ''), color: r.kind === 'income' ? BRAND.green : BRAND.ink },
      ]),
    )
  }

  doc.finish()
  return pdf.save()
}

// ─────────────────────────────────────────────────────────────────────────
// Brand-matched PDF toolkit (Budge)
//
// Coral header band, Poppins headings + Nunito Sans body, sand-toned cards,
// striped tables and category pies — mirroring the app's look. Fonts are
// pulled from jsDelivr (reachable from the edge runtime), cached per warm
// isolate, and every text draw degrades gracefully: a glyph the brand font
// can't encode is redrawn with an embedded Unicode face (DejaVu Sans), and if
// the brand fonts can't be fetched at all we fall back to Helvetica.
// ─────────────────────────────────────────────────────────────────────────

const c = (r: number, g: number, b: number) => rgb(r / 255, g / 255, b / 255)
const BRAND = {
  coral: c(249, 93, 56),
  coralDark: c(189, 52, 24),
  gold: c(245, 158, 11),
  ink: c(36, 32, 25),
  muted: c(124, 111, 89),
  line: c(232, 225, 213),
  card: c(250, 248, 244),
  stripe: c(243, 239, 231),
  white: rgb(1, 1, 1),
  green: c(22, 163, 74),
  red: c(226, 67, 31),
}
// Warm, on-brand palette cycled across pie slices / legends.
const PIE = [
  c(249, 93, 56), c(245, 158, 11), c(255, 160, 136), c(189, 52, 24),
  c(154, 139, 114), c(251, 179, 36), c(255, 122, 90), c(95, 85, 69),
  c(253, 223, 138), c(214, 204, 186),
]

// Static TTFs bundled in the @expo-google-fonts npm packages (verified to
// resolve from the edge runtime; the google/fonts gh repo only keeps variable
// fonts for these families). DejaVu Sans is the Unicode fallback face.
const EXPO = 'https://cdn.jsdelivr.net/npm/@expo-google-fonts'
const DEJAVU = 'https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf'
const FONT_URLS = {
  head: [`${EXPO}/poppins/Poppins_600SemiBold.ttf`],
  headBold: [`${EXPO}/poppins/Poppins_700Bold.ttf`],
  body: [`${EXPO}/nunito-sans/NunitoSans_400Regular.ttf`],
  bodyBold: [`${EXPO}/nunito-sans/NunitoSans_700Bold.ttf`],
  uni: [`${DEJAVU}/DejaVuSans.ttf`],
}
const fontBytes: Record<string, ArrayBuffer | null> = {}
async function fetchFont(url: string): Promise<ArrayBuffer | null> {
  if (url in fontBytes) return fontBytes[url]
  try {
    const r = await fetch(url)
    fontBytes[url] = r.ok ? await r.arrayBuffer() : null
  } catch {
    fontBytes[url] = null
  }
  return fontBytes[url]
}

interface BrandFonts {
  head: PDFFont; headBold: PDFFont; body: PDFFont; bodyBold: PDFFont; uni: PDFFont | null
}
async function loadBrandFonts(pdf: PDFDocument): Promise<BrandFonts> {
  const helv = await pdf.embedFont(StandardFonts.Helvetica)
  const helvB = await pdf.embedFont(StandardFonts.HelveticaBold)
  const embed = async (urls: string[], fallback: PDFFont) => {
    for (const url of urls) {
      const bytes = await fetchFont(url)
      if (!bytes) continue
      try { return await pdf.embedFont(bytes, { subset: true }) } catch { /* try next */ }
    }
    return fallback
  }
  const uni = await embed(FONT_URLS.uni, null as unknown as PDFFont) || null
  return {
    head: await embed(FONT_URLS.head, helvB),
    headBold: await embed(FONT_URLS.headBold, helvB),
    body: await embed(FONT_URLS.body, uni ?? helv),
    bodyBold: await embed(FONT_URLS.bodyBold, uni ?? helvB),
    uni: uni ?? null,
  }
}

// Fold characters the brand fonts can't encode down to ASCII (last resort).
function asciiFold(s: string): string {
  return String(s)
    .replace(/[‘’‚]/g, "'").replace(/[“”„]/g, '"')
    .replace(/[→➡➔]/g, '->').replace(/←/g, '<-')
    .replace(/[–—]/g, '-').replace(/…/g, '...')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '?')
}
function money(n: number, cur?: string): string {
  const neg = n < 0
  const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${neg ? '-' : ''}${s}${cur ? ' ' + cur : ''}`
}

type Cell = string | { text: string; color?: ReturnType<typeof rgb>; font?: PDFFont }
interface Col { title: string; width: number; align?: 'left' | 'right' }

// A flowing, brand-styled A4 statement. Coordinates are screen-space
// (y grows downward from the top); drawText's bottom-left origin is handled
// internally so callers think top-down.
class Statement {
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

  addPage() {
    this.page = this.pdf.addPage([this.W, this.H])
    this.y = this.M
  }
  ensure(h: number) {
    if (this.y + h > this.H - 46) this.addPage()
  }

  // Draw a string with its baseline near screen-y `ty`. Falls back to the
  // Unicode face, then to an ASCII fold, if the chosen font can't encode it.
  text(str: string, x: number, ty: number, opts: { size?: number; font?: PDFFont; color?: any } = {}) {
    const size = opts.size ?? 10
    const color = opts.color ?? BRAND.ink
    const yb = this.H - ty - size
    // The brand fonts (Poppins/Nunito Sans) are Latin only and would render
    // non-Latin text as blank boxes without throwing. Route anything beyond
    // Latin Extended-B to the embedded Unicode face so Greek/Cyrillic/arrows
    // render for real; keep Latin text in the brand font.
    let font = opts.font ?? this.f.body
    if (this.f.uni && /[^ -ɏ]/.test(str)) font = this.f.uni
    try { this.page.drawText(str, { x, y: yb, size, font, color }); return }
    catch { /* fall through */ }
    if (this.f.uni) {
      try { this.page.drawText(str, { x, y: yb, size, font: this.f.uni, color }); return }
      catch { /* fall through */ }
    }
    this.page.drawText(asciiFold(str), { x, y: yb, size, font, color })
  }

  fill(x: number, ty: number, w: number, h: number, color: any, border?: any) {
    this.page.drawRectangle({
      x, y: this.H - ty - h, width: w, height: h, color,
      ...(border ? { borderColor: border, borderWidth: 0.8 } : {}),
    })
  }

  width(str: string, font: PDFFont, size: number): number {
    try { return font.widthOfTextAtSize(str, size) }
    catch { return asciiFold(str).length * size * 0.5 }
  }
  truncate(str: string, font: PDFFont, size: number, maxW: number): string {
    if (this.width(str, font, size) <= maxW) return str
    let s = str
    while (s.length > 1 && this.width(s + '…', font, size) > maxW) s = s.slice(0, -1)
    return s + '…'
  }
  textRight(str: string, xRight: number, ty: number, opts: { size?: number; font?: PDFFont; color?: any } = {}) {
    const size = opts.size ?? 10
    const font = opts.font ?? this.f.body
    this.text(str, xRight - this.width(str, font, size), ty, opts)
  }

  // ── Building blocks ──────────────────────────────────────────────────
  header(title: string, meta: string, name?: string) {
    const bandH = 96
    this.page.drawRectangle({ x: 0, y: this.H - bandH, width: this.W, height: bandH, color: BRAND.coral })
    this.text('budge', this.M, 30, { size: 23, font: this.f.headBold, color: BRAND.white })
    if (name) this.text(name, this.M, 62, { size: 10.5, font: this.f.body, color: c(255, 235, 228) })
    this.textRight(title, this.W - this.M, 32, { size: 15, font: this.f.head, color: BRAND.white })
    this.textRight(meta, this.W - this.M, 58, { size: 9.5, font: this.f.body, color: c(255, 224, 214) })
    this.y = bandH + 26
  }

  sectionTitle(str: string) {
    this.ensure(34)
    this.y += 6
    this.fill(this.M, this.y + 1, 4, 13, BRAND.coral)
    this.text(str, this.M + 12, this.y, { size: 12.5, font: this.f.head, color: BRAND.ink })
    this.y += 24
  }

  muted(str: string) {
    this.ensure(18)
    this.text(str, this.M, this.y, { size: 10, color: BRAND.muted })
    this.y += 18
  }

  statCards(items: { label: string; value: string; color: any }[]) {
    this.ensure(74)
    const gap = 12
    const n = items.length
    const w = (this.CW - gap * (n - 1)) / n
    const h = 62
    items.forEach((it, i) => {
      const x = this.M + i * (w + gap)
      this.fill(x, this.y, w, h, BRAND.card, BRAND.line)
      this.text(it.label.toUpperCase(), x + 14, this.y + 16, { size: 8, font: this.f.bodyBold, color: BRAND.muted })
      const vs = this.truncate(it.value, this.f.headBold, 15, w - 24)
      this.text(vs, x + 14, this.y + 34, { size: 15, font: this.f.headBold, color: it.color })
    })
    this.y += h + 22
  }

  // Category pie with a legend to its right. `items` are pre-sorted desc.
  pie(items: { label: string; value: number }[], total: number, cur: string) {
    const r = 68
    const cx = this.M + r + 6
    const blockH = r * 2 + 12
    this.ensure(blockH + 6)
    const cy = this.y + r
    let a0 = -Math.PI / 2
    items.forEach((it, i) => {
      const frac = it.value / total
      const a1 = a0 + frac * Math.PI * 2
      const col = PIE[i % PIE.length]
      // Full circle can't be one arc; near-100% slices draw as a disc.
      if (frac >= 0.999) {
        this.page.drawCircle({ x: cx, y: this.H - cy, size: r, color: col })
      } else {
        const p0 = [cx + r * Math.cos(a0), cy + r * Math.sin(a0)]
        const p1 = [cx + r * Math.cos(a1), cy + r * Math.sin(a1)]
        const large = a1 - a0 > Math.PI ? 1 : 0
        const path = `M ${cx} ${cy} L ${p0[0]} ${p0[1]} A ${r} ${r} 0 ${large} 1 ${p1[0]} ${p1[1]} Z`
        this.page.drawSvgPath(path, { x: 0, y: this.H, color: col, borderWidth: 0 })
      }
      a0 = a1
    })
    // Donut hole for a lighter, modern look.
    this.page.drawCircle({ x: cx, y: this.H - cy, size: r * 0.52, color: BRAND.white })

    // Legend
    const lx = cx + r + 26
    const lw = this.M + this.CW - lx
    let ly = this.y + 4
    const shown = items.slice(0, 8)
    for (let i = 0; i < shown.length; i++) {
      const it = shown[i]
      const pct = ((it.value / total) * 100).toFixed(1)
      this.fill(lx, ly + 1, 9, 9, PIE[i % PIE.length])
      const amt = `${money(it.value, cur)}  ·  ${pct}%`
      const amtW = this.width(amt, this.f.body, 9)
      const name = this.truncate(it.label, this.f.bodyBold, 9.5, lw - 16 - amtW - 10)
      this.text(name, lx + 16, ly, { size: 9.5, font: this.f.bodyBold, color: BRAND.ink })
      this.textRight(amt, lx + lw, ly, { size: 9, color: BRAND.muted })
      ly += 17
    }
    if (items.length > shown.length) {
      const rest = items.slice(shown.length).reduce((s, it) => s + it.value, 0)
      this.text(`+ ${items.length - shown.length} more`, lx + 16, ly, { size: 9, color: BRAND.muted })
      this.textRight(money(rest, cur), lx + lw, ly, { size: 9, color: BRAND.muted })
      ly += 17
    }
    this.y += Math.max(blockH, ly - this.y) + 12
  }

  table(cols: Col[], rows: Cell[][]) {
    const xs: number[] = []
    let x = this.M
    for (const col of cols) { xs.push(x); x += col.width }
    const rowH = 19
    const drawHead = () => {
      this.fill(this.M, this.y, this.CW, 22, BRAND.coral)
      cols.forEach((col, i) => {
        const tx = xs[i]
        if (col.align === 'right') {
          this.textRight(col.title, tx + col.width - 8, this.y + 6.5, { size: 8.5, font: this.f.bodyBold, color: BRAND.white })
        } else {
          this.text(col.title, tx + 8, this.y + 6.5, { size: 8.5, font: this.f.bodyBold, color: BRAND.white })
        }
      })
      this.y += 22
    }
    this.ensure(22 + rowH)
    drawHead()
    rows.forEach((row, ri) => {
      if (this.y + rowH > this.H - 46) { this.addPage(); drawHead() }
      if (ri % 2 === 1) this.fill(this.M, this.y, this.CW, rowH, BRAND.stripe)
      cols.forEach((col, i) => {
        const cell = row[i]
        const val = typeof cell === 'string' ? cell : cell.text
        const color = typeof cell === 'string' ? BRAND.ink : (cell.color ?? BRAND.ink)
        const font = typeof cell === 'string' ? this.f.body : (cell.font ?? this.f.body)
        const tx = xs[i]
        if (col.align === 'right') {
          this.textRight(this.truncate(val, font, 9, col.width - 12), tx + col.width - 8, this.y + 5.5, { size: 9, font, color })
        } else {
          this.text(this.truncate(val, font, 9, col.width - 12), tx + 8, this.y + 5.5, { size: 9, font, color })
        }
      })
      this.y += rowH
    })
    this.y += 8
  }

  // Two-column list (label left, value right) used for balances / totals.
  rows(items: { left: string; right: string; rightColor?: any; strong?: boolean }[]) {
    for (const it of items) {
      this.ensure(20)
      if (it.strong) this.fill(this.M, this.y, this.CW, 19, BRAND.card)
      const lf = it.strong ? this.f.bodyBold : this.f.body
      this.text(this.truncate(it.left, lf, 10, this.CW - 140), this.M + (it.strong ? 8 : 0), this.y + 3, { size: 10, font: lf, color: BRAND.ink })
      this.textRight(it.right, this.M + this.CW - (it.strong ? 8 : 0), this.y + 3, { size: 10, font: this.f.bodyBold, color: it.rightColor ?? BRAND.ink })
      this.y += 19
    }
    this.y += 6
  }

  finish() {
    const pages = this.pdf.getPages()
    const total = pages.length
    pages.forEach((p, i) => {
      p.drawRectangle({ x: this.M, y: 36, width: this.CW, height: 0.8, color: BRAND.line })
      p.drawText('Generated by Budge', { x: this.M, y: 24, size: 8, font: this.f.body, color: BRAND.muted })
      const label = `${i + 1} / ${total}`
      const w = this.width(label, this.f.body, 8)
      p.drawText(label, { x: this.M + this.CW - w, y: 24, size: 8, font: this.f.body, color: BRAND.muted })
    })
  }
}
