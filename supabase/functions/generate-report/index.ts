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
// Excel is SheetJS; the PDF uses the shared brand toolkit (_shared/pdf.ts).

import * as XLSX from 'https://esm.sh/xlsx@0.18.5'
import { PDFDocument } from 'https://esm.sh/pdf-lib@1.17.1'
import { BRAND, loadBrandFonts, money, Statement } from '../_shared/pdf.ts'
import { withCors, json, callerClient } from '../_shared/http.ts'
import { buildStatement, pendingNote, yearlyLabel, yearlyNote } from './statementMath.ts'

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
      .select('base_currency, display_name, yearly_separate').single()
    const base = profile?.base_currency ?? 'USD'
    const separateYearly = profile?.yearly_separate === true

    // p_spread: also the yearly charges paid before `from` that still cover
    // the period (only their monthly parts count; the list shows the period).
    const { data: txns, error } = await supabase
      .rpc('my_transactions', { p_from: from, p_to: to, p_spread: true })
    if (error) throw error
    let rules: unknown[] = []
    if (separateYearly) {
      const { data, error: rulesErr } = await supabase.rpc('my_recurring_rules')
      if (rulesErr) throw rulesErr
      rules = data ?? []
    }

    // Oldest first; foreign rows whose rate is still pending are listed but
    // kept out of every total (see statementMath.ts).
    const stmt = buildStatement(txns ?? [], base, { from, to, separateYearly, rules })
    const notes = [pendingNote(stmt.pending), yearlyNote(stmt.yearlyMode)].filter(Boolean) as string[]

    if (format === 'pdf') {
      const bytes = await buildPdf({ from, to, base, ...stmt, notes, name: profile?.display_name })
      return new Response(bytes, {
        headers: { 'Content-Type': 'application/pdf' },
      })
    }

    const bytes = buildXlsx({ base, ...stmt, notes })
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

function buildXlsx({ base, rows, totalSpent, totalIncome, byCategory, notes, yearly }: any): Uint8Array {
  const wb = XLSX.utils.book_new()
  const summary = [
    ['Financial Statement'],
    ['Base currency', base],
    [],
    ['Total income', totalIncome],
    ['Total expenses', totalSpent],
    ['Net', totalIncome - totalSpent],
    ...notes.map((n: string) => [n]),
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
      Yearly: yearlyLabel(r) ?? '',
    })),
  )
  XLSX.utils.book_append_sheet(wb, txnSheet, 'Transactions')

  if (yearly) {
    const sheet = [
      ['Yearly subscriptions (kept out of the totals)'],
      [`Paid in this period (${base})`, yearly.paidTotal],
      [`Active subscriptions per year (${base})`, yearly.perYear],
      [`Per month (${base})`, yearly.perMonth],
      ...(yearly.foreign ? [['Other currencies are added at face value (recurring entries have no exchange rate).']] : []),
      [],
      ['Payments in this period'],
      ['Date', 'Description', 'Currency', 'Amount', `Amount (${base})`],
      ...yearly.payments.map((r: any) => [
        r.date, safeCell(r.description || r.category), r.currency, r.amount, r.base_amount ?? 'Rate pending',
      ]),
      [],
      ['Active yearly subscriptions'],
      ['Subscription', 'Next charge', 'Currency', 'Charge', 'Per year'],
      ...yearly.rules.map((r: any) => [safeCell(r.name), r.nextRun, r.currency, r.amount, r.perYear]),
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheet), 'Yearly subscriptions')
  }
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }))
}

async function buildPdf(
  { from, to, base, rows, totalSpent, totalIncome, byCategory, notes, yearly, name }: any,
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
  for (const n of notes) doc.muted(`* ${n}`)

  const cats = Object.entries(byCategory)
    .map(([label, value]) => ({ label, value: Number(value) }))
    .sort((a, b) => b.value - a.value)
  if (cats.length > 0 && totalSpent > 0) {
    doc.sectionTitle('Spending by category')
    doc.pie(cats, totalSpent, base)
  }

  if (yearly) {
    doc.sectionTitle('Yearly subscriptions')
    doc.rows([
      { left: 'Paid in this period (not in the totals)', right: money(yearly.paidTotal, base) },
      { left: 'Active subscriptions per year', right: money(yearly.perYear, base), strong: true },
      { left: 'Per month', right: `≈ ${money(yearly.perMonth, base)}` },
    ])
    if (yearly.foreign) doc.muted('Other currencies are added at face value (recurring entries have no exchange rate).')
    if (yearly.payments.length > 0) {
      doc.table(
        [
          { title: 'Paid', width: 66 },
          { title: 'Payment', width: 355 },
          { title: `Amount (${base})`, width: 90, align: 'right' },
        ],
        yearly.payments.map((r: any) => [
          r.date,
          r.description || r.category,
          r.base_amount == null
            ? { text: `${money(r.amount, r.currency)} *`, color: BRAND.muted }
            : money(r.base_amount, ''),
        ]),
      )
    }
    if (yearly.rules.length > 0) {
      doc.table(
        [
          { title: 'Subscription', width: 231 },
          { title: 'Next charge', width: 90 },
          { title: 'Charge', width: 100, align: 'right' },
          { title: 'Per year', width: 90, align: 'right' },
        ],
        yearly.rules.map((r: any) => [
          r.name, r.nextRun, money(r.amount, r.currency), money(r.perYear, r.currency),
        ]),
      )
    }
  }

  doc.sectionTitle('Transactions')
  if (rows.length === 0) {
    doc.muted('No transactions in this period.')
  } else {
    doc.table(
      [
        { title: 'Date', width: 66 },
        { title: 'Category', width: 105 },
        { title: 'Description', width: 250 },
        { title: `Amount (${base})`, width: 90, align: 'right' },
      ],
      rows.map((r: any) => {
        // Yearly payments carry their mark (the totals count them per the
        // note up top); the description is truncated before the mark is.
        const mark = yearlyLabel(r)
        return [
          r.date,
          r.category,
          mark ? `${mark}  ·  ${r.description || '—'}` : (r.description || '—'),
          r.base_amount == null
            // Rate pending: its own currency, starred (see the note up top).
            ? { text: `${money(r.amount, r.currency)} *`, color: BRAND.muted }
            : { text: money(r.base_amount, ''), color: r.kind === 'income' ? BRAND.green : BRAND.ink },
        ]
      }),
    )
  }

  doc.finish()
  return pdf.save()
}
