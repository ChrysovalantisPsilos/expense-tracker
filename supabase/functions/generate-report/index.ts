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
// Excel is generated with SheetJS (multi-sheet). PDF is generated with
// pdf-lib (single summary page + transaction table). Both run in Deno.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as XLSX from 'https://esm.sh/xlsx@0.18.5'
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1'

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { from, to, format = 'xlsx' } = (await req.json()) as Body
    if (!from || !to) {
      return json({ error: 'from and to are required' }, 400)
    }

    // Scope the client to the caller's JWT so RLS restricts rows to this user.
    const authHeader = req.headers.get('Authorization') ?? ''
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )

    const { data: profile } = await supabase.from('profiles').select('base_currency, display_name').single()
    const base = profile?.base_currency ?? 'USD'

    const { data: txns, error } = await supabase
      .from('transactions')
      .select('spent_at, kind, amount_minor, currency, exchange_rate, description, categories(name)')
      .gte('spent_at', from)
      .lte('spent_at', to)
      .order('spent_at', { ascending: true })
    if (error) throw error

    const rows = (txns ?? []).map((t) => ({
      date: t.spent_at,
      kind: t.kind,
      category: t.categories?.name ?? 'Uncategorized',
      description: t.description ?? '',
      currency: t.currency,
      amount: t.amount_minor / 100,
      base_amount: Math.round(t.amount_minor * Number(t.exchange_rate)) / 100,
    }))

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
    return json({ error: String(e?.message ?? e) }, 500)
  }
})

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
    ...Object.entries(byCategory).sort((a: any, b: any) => b[1] - a[1]),
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), 'Summary')

  // Transactions sheet
  const txnSheet = XLSX.utils.json_to_sheet(
    rows.map((r: any) => ({
      Date: r.date, Type: r.kind, Category: r.category, Description: r.description,
      Currency: r.currency, Amount: r.amount, [`Amount (${base})`]: r.base_amount,
    })),
  )
  XLSX.utils.book_append_sheet(wb, txnSheet, 'Transactions')

  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }))
}

async function buildPdf({ from, to, base, rows, totalSpent, totalIncome, byCategory, name }: any): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  let page = pdf.addPage([595, 842]) // A4
  const { height } = page.getSize()
  let y = height - 60
  const ink = rgb(0.1, 0.1, 0.12)

  const line = (text: string, size = 11, f = font, dy = 18) => {
    page.drawText(String(text), { x: 50, y, size, font: f, color: ink })
    y -= dy
    if (y < 60) { page = pdf.addPage([595, 842]); y = height - 60 }
  }

  line('Financial Statement', 20, bold, 28)
  if (name) line(String(name), 11)
  line(`Period: ${from} to ${to}   ·   Base currency: ${base}`, 10)
  y -= 8
  line('Summary', 14, bold, 22)
  line(`Total income:   ${totalIncome.toFixed(2)} ${base}`)
  line(`Total expenses: ${totalSpent.toFixed(2)} ${base}`)
  line(`Net:            ${(totalIncome - totalSpent).toFixed(2)} ${base}`, 11, bold)
  y -= 8
  line('Spending by category', 14, bold, 22)
  for (const [cat, amt] of Object.entries(byCategory).sort((a: any, b: any) => b[1] - a[1])) {
    line(`${cat}: ${Number(amt).toFixed(2)} ${base}`, 10)
  }
  y -= 8
  line('Transactions', 14, bold, 22)
  line('Date        Type     Category        Amount', 9, bold)
  for (const r of rows) {
    line(
      `${r.date}  ${r.kind.padEnd(7)}  ${String(r.category).slice(0, 14).padEnd(15)} ${r.base_amount.toFixed(2)} ${base}`,
      9, font, 14,
    )
  }

  return pdf.save()
}
