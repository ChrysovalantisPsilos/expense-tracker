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
// Excel is SheetJS; the PDF uses the shared brand toolkit (_shared/pdf.ts).

import * as XLSX from 'https://esm.sh/xlsx@0.18.5'
import { PDFDocument } from 'https://esm.sh/pdf-lib@1.17.1'
import { BRAND, loadBrandFonts, money, Statement } from '../_shared/pdf.ts'
import { withCors, json, callerClient } from '../_shared/http.ts'
import { buildStatement, pendingNote } from './statementMath.ts'

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

    const { data: profile } = await supabase.from('profiles').select('base_currency, display_name').single()
    const base = profile?.base_currency ?? 'USD'

    const { data: txns, error } = await supabase
      .rpc('my_transactions', { p_from: from, p_to: to })
    if (error) throw error

    // Oldest first; foreign rows whose rate is still pending are listed but
    // kept out of every total (see statementMath.ts).
    const stmt = buildStatement(txns ?? [], base)
    const note = pendingNote(stmt.pending)

    if (format === 'pdf') {
      const bytes = await buildPdf({ from, to, base, ...stmt, note, name: profile?.display_name })
      return new Response(bytes, {
        headers: { 'Content-Type': 'application/pdf' },
      })
    }

    const bytes = buildXlsx({ base, ...stmt, note })
    return new Response(bytes, {
      headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    })
  } catch (e) {
    console.error('generate-report error', e)
    return json({ error: 'Could not generate the report.' }, 500)
  }
}))

// Neutralise spreadsheet formula injection: cells starting with a formula
// trigger are prefixed with an apostrophe so Excel/Sheets treat them as text.
function safeCell(v: unknown) {
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(v)) return `'${v}`
  return v
}

function buildXlsx({ base, rows, totalSpent, totalIncome, byCategory, note }: any): Uint8Array {
  const wb = XLSX.utils.book_new()
  const summary = [
    ['Financial Statement'],
    ['Base currency', base],
    [],
    ['Total income', totalIncome],
    ['Total expenses', totalSpent],
    ['Net', totalIncome - totalSpent],
    ...(note ? [[note]] : []),
    [],
    ['Spending by category'],
    ...Object.entries(byCategory).sort((a: any, b: any) => b[1] - a[1])
      .map(([k, v]) => [safeCell(k), v]),
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), 'Summary')

  const txnSheet = XLSX.utils.json_to_sheet(
    rows.map((r: any) => ({
      Date: r.date, Type: r.kind, Category: safeCell(r.category), Description: safeCell(r.description),
      Currency: r.currency, Amount: r.amount,
      [`Amount (${base})`]: r.base_amount ?? 'Rate pending',
    })),
  )
  XLSX.utils.book_append_sheet(wb, txnSheet, 'Transactions')
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }))
}

async function buildPdf(
  { from, to, base, rows, totalSpent, totalIncome, byCategory, note, name }: any,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const fonts = await loadBrandFonts(pdf)
  const doc = new Statement(pdf, fonts)

  doc.header('Financial statement', `${from}  →  ${to}   ·   ${base}`, name)

  const net = totalIncome - totalSpent
  doc.statCards([
    { label: 'Income', value: money(totalIncome, base), color: BRAND.green },
    { label: 'Expenses', value: money(totalSpent, base), color: BRAND.coral },
    { label: 'Net', value: money(net, base), color: net < 0 ? BRAND.red : BRAND.ink },
  ])
  if (note) doc.muted(`* ${note}`)

  const cats = Object.entries(byCategory)
    .map(([label, value]) => ({ label, value: Number(value) }))
    .sort((a, b) => b.value - a.value)
  if (cats.length > 0 && totalSpent > 0) {
    doc.sectionTitle('Spending by category')
    doc.pie(cats, totalSpent, base)
  }

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
        r.base_amount == null
          // Rate pending: its own currency, starred (see the note up top).
          ? { text: `${money(r.amount, r.currency)} *`, color: BRAND.muted }
          : { text: money(r.base_amount, ''), color: r.kind === 'income' ? BRAND.green : BRAND.ink },
      ]),
    )
  }

  doc.finish()
  return pdf.save()
}
