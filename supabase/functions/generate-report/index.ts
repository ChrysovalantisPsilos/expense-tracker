// Supabase Edge Function: generate-report
//
// Builds a "full financial statement" for the calling user over a date range
// and returns it as an .xlsx or .pdf file.
//
//   POST /functions/v1/generate-report
//   body: { from: "2026-01-01", to: "2026-01-31", format: "xlsx" | "pdf" }
//
// Auth: verify_jwt = true. We read the caller's JWT, create a Supabase client
// scoped to that user, and pull only their transactions through the
// decrypting my_transactions RPC (own rows only; amounts/descriptions are
// encrypted at rest). No service-role key is used.
//
// Yearly subscriptions follow the caller's app setting (profiles.
// yearly_separate, 0068): by default the totals count them month by month,
// like the app (so the fetch includes earlier yearly charges that still cover
// the period); kept separate, they're left out of the totals and get their own
// section, with the active yearly rules' cost (my_recurring_rules).
//
// Salary paid late in the month follows the caller's setting too (profiles.
// salary_shift_from_day/salary_category_id, 0081): from day D it counts toward
// the next month's totals, so the fetch starts at day D of the month before
// `from` (shiftFetchFrom) and the list still shows only the period's payments.
//
// Excel is SheetJS (0.18.5: the edge bundler only fetches allow-listed hosts,
// and the app's 0.20.3 build is served from cdn.sheetjs.com alone, so it can't
// be imported here; writing a workbook is unaffected); the PDF uses the shared
// brand toolkit (_shared/pdf.ts). The file goes back through fileResponse
// (_shared/files.ts), whose Content-Type keeps it binary in the app.

import * as XLSX from 'https://esm.sh/xlsx@0.18.5'
import { PDFDocument } from 'https://esm.sh/pdf-lib@1.17.1'
import { loadBrandFonts, money, Statement } from '../_shared/pdf.ts'
import { withCors, json, callerClient } from '../_shared/http.ts'
import { fileResponse } from '../_shared/files.ts'
import { categoryBars } from '../_shared/breakdown.ts'
import { salaryShiftOf, shiftFetchFrom } from '../_shared/salaryShift.ts'
import {
  buildStatement, pendingNote, salaryNote, statementSheets, yearlyLabel, yearlyNote,
  type Sheet, type Statement as StatementData, type StatementRow,
} from './statementMath.ts'

interface Body {
  from: string
  to: string
  format: 'xlsx' | 'pdf'
}

Deno.serve(withCors(async (req) => {
  try {
    const { from, to, format = 'xlsx' } = (await req.json()) as Body
    const DATE = /^\d{4}-\d{2}-\d{2}$/
    if (!DATE.test(from ?? '') || !DATE.test(to ?? '')) {
      return json({ error: 'from and to must be dates (YYYY-MM-DD)' }, 400)
    }
    if (format !== 'xlsx' && format !== 'pdf') {
      return json({ error: 'format must be xlsx or pdf' }, 400)
    }

    const supabase = callerClient(req)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return json({ error: 'not authenticated' }, 401)
    // Per-caller quota (keyed on the caller's own uid server-side). Fails closed.
    const { data: allowed, error: quotaErr } = await supabase.rpc('consume_quota', { p_scope: 'report' })
    if (quotaErr) throw quotaErr
    if (allowed !== true) return json({ error: 'Too many report requests. Please try again later.' }, 429)

    const { data: profile } = await supabase.from('profiles')
      .select('base_currency, display_name, yearly_separate, salary_shift_from_day, salary_category_id').single()
    const base = profile?.base_currency ?? 'USD'
    const separateYearly = profile?.yearly_separate === true
    const salaryShift = salaryShiftOf(profile)

    // p_spread: also the yearly charges paid before `from` that still cover
    // the period (only their monthly parts count; the list shows the period).
    const { data: txns, error } = await supabase
      .rpc('my_transactions', { p_from: shiftFetchFrom(from, salaryShift), p_to: to, p_spread: true })
    if (error) throw error
    let rules: unknown[] = []
    if (separateYearly) {
      const { data, error: rulesErr } = await supabase.rpc('my_recurring_rules')
      if (rulesErr) throw rulesErr
      rules = data ?? []
    }

    // Oldest first; foreign rows whose rate is still pending are listed but
    // kept out of every total (see statementMath.ts).
    const stmt = buildStatement(txns ?? [], base, { from, to, separateYearly, rules, salaryShift })
    const notes = [pendingNote(stmt.pending), yearlyNote(stmt.yearlyMode), salaryNote(stmt.salaryShiftDay)]
      .filter(Boolean) as string[]

    const bytes = format === 'pdf'
      ? await buildPdf({ from, to, base, stmt, notes, name: profile?.display_name })
      : buildXlsx(statementSheets(stmt, base, notes))
    return fileResponse(bytes, format, `financial-statement_${from}_${to}.${format}`)
  } catch (e) {
    console.error('generate-report error', e)
    return json({ error: 'Could not generate the report.' }, 500)
  }
}))

function buildXlsx(sheets: Sheet[]): Uint8Array {
  const wb = XLSX.utils.book_new()
  for (const s of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s.rows), s.name)
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }))
}

// A row whose rate is pending shows its own amount, starred (see the notes).
const pendingCell = (r: StatementRow) => ({ text: `${money(r.amount, r.currency)} *`, tone: 'muted' as const })

async function buildPdf({ from, to, base, stmt, notes, name }: {
  from: string; to: string; base: string; stmt: StatementData; notes: string[]; name?: string
}): Promise<Uint8Array> {
  const { rows, totalSpent, totalIncome, byCategory, yearly } = stmt
  const pdf = await PDFDocument.create()
  const fonts = await loadBrandFonts(pdf)
  const doc = new Statement(pdf, fonts)

  doc.header('Financial statement', `${from}  →  ${to}   ·   ${base}`, name)

  const net = totalIncome - totalSpent
  doc.tiles([
    { label: 'Income', value: money(totalIncome, base), tone: 'positive' },
    { label: 'Spent', value: money(totalSpent, base) },
    {
      label: 'Net', value: `${net > 0 ? '+' : ''}${money(net, base)}`,
      tone: net < 0 ? 'negative' : net > 0 ? 'positive' : 'muted',
    },
  ])
  doc.notes(notes)

  // The app's "Where your money went": top 5 categories + "Other".
  const bars = categoryBars(Object.entries(byCategory).map(([label, value]) => ({ name: label, value })))
  if (bars.length > 0) {
    doc.panel({
      title: 'Where your money went',
      subtitle: `${money(totalSpent, base)} spent, by category`,
      contentH: Statement.breakdownHeight(bars.length),
    }, (x, y, w) => doc.breakdown(x, y, w, bars.map((b) => ({ ...b, meta: money(b.value, base) }))))
  }

  if (yearly) {
    doc.sectionTitle('Yearly subscriptions', 'Kept out of the totals')
    doc.tiles([
      { label: 'Paid in this period', value: money(yearly.paidTotal, base) },
      { label: 'Active subscriptions, per year', value: money(yearly.perYear, base), tone: 'accent' },
      { label: 'Per month', value: `≈ ${money(yearly.perMonth, base)}` },
    ], { size: 13 })
    if (yearly.foreign) doc.muted('Other currencies are added at face value (recurring entries have no exchange rate).')
    if (yearly.payments.length > 0) {
      doc.table(
        [
          { title: 'Paid', width: 70 },
          { title: 'Payment', width: 336 },
          { title: `Amount (${base})`, width: 105, align: 'right' },
        ],
        yearly.payments.map((r) => [
          r.date,
          r.description || r.category,
          r.base_amount == null ? pendingCell(r) : { text: money(r.base_amount), bold: true },
        ]),
      )
    }
    if (yearly.rules.length > 0) {
      doc.table(
        [
          { title: 'Subscription', width: 216 },
          { title: 'Next charge', width: 90 },
          { title: 'Charge', width: 105, align: 'right' },
          { title: 'Per year', width: 100, align: 'right' },
        ],
        yearly.rules.map((r) => [
          r.name, r.nextRun, money(r.amount, r.currency), { text: money(r.perYear, r.currency), bold: true },
        ]),
      )
    }
  }

  doc.sectionTitle('Transactions', `${rows.length} in this period`)
  if (rows.length === 0) {
    doc.muted('No transactions in this period.')
  } else {
    doc.table(
      [
        { title: 'Date', width: 70 },
        { title: 'Category', width: 110 },
        { title: 'Description', width: 226 },
        { title: `Amount (${base})`, width: 105, align: 'right' },
      ],
      rows.map((r) => {
        // Yearly payments carry their mark (the totals count them per the
        // note up top); the description is truncated before the mark is.
        const mark = yearlyLabel(r)
        const income = r.kind === 'income'
        return [
          r.date,
          r.category,
          mark ? `${mark}  ·  ${r.description || '—'}` : (r.description || '—'),
          r.base_amount == null
            ? pendingCell(r)
            : { text: `${income ? '+' : ''}${money(r.base_amount)}`, tone: income ? 'positive' : 'default', bold: true },
        ]
      }),
    )
  }

  doc.finish()
  return pdf.save()
}
