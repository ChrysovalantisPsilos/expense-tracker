// Edge Function: group-report
// Builds a PDF statement for a group: current balances, settlement history, and
// the full immutable audit trail. verify_jwt = true.
//
// Auth/isolation: the function uses the CALLER'S JWT with the anon key, so RLS
// restricts everything to groups the caller is a member of. A non-member gets
// an empty group lookup → 403. No service-role key is used.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'CLP'])
function fmt(minor: number, cur: string): string {
  const factor = ZERO_DECIMAL.has(cur) ? 1 : 100
  const v = (minor / factor).toFixed(factor === 1 ? 0 : 2)
  return `${v} ${cur}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { group_id } = await req.json()
    if (!group_id || typeof group_id !== 'string') return json({ error: 'group_id is required' }, 400)

    const authHeader = req.headers.get('Authorization') ?? ''
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )

    const { data: group } = await supabase
      .from('groups').select('id, name, currency').eq('id', group_id).maybeSingle()
    if (!group) return json({ error: 'not allowed for this group' }, 403)
    const cur = group.currency

    const [{ data: members }, { data: expenses }, { data: settlements }, { data: log }] = await Promise.all([
      supabase.from('group_members').select('id, display_name').eq('group_id', group_id).order('created_at'),
      supabase.from('group_expenses').select('paid_by, amount_minor, expense_splits(member_id, share_minor)').eq('group_id', group_id),
      supabase.from('settlements').select('from_member, to_member, amount_minor, settled_at').eq('group_id', group_id).order('settled_at', { ascending: false }),
      supabase.from('group_audit_log').select('created_at, summary, amount_minor, currency, action').eq('group_id', group_id).order('created_at', { ascending: false }),
    ])

    const nameOf = (id: string) => (members ?? []).find((m: any) => m.id === id)?.display_name ?? '—'

    // Net per member: paid − owed_shares + settled_out − settled_in.
    const net = new Map<string, number>((members ?? []).map((m: any) => [m.id, 0]))
    for (const e of expenses ?? []) {
      net.set(e.paid_by, (net.get(e.paid_by) ?? 0) + e.amount_minor)
      for (const s of e.expense_splits ?? []) net.set(s.member_id, (net.get(s.member_id) ?? 0) - s.share_minor)
    }
    for (const s of settlements ?? []) {
      net.set(s.from_member, (net.get(s.from_member) ?? 0) + s.amount_minor)
      net.set(s.to_member, (net.get(s.to_member) ?? 0) - s.amount_minor)
    }

    const bytes = await buildPdf({ group, cur, members: members ?? [], settlements: settlements ?? [], log: log ?? [], net, nameOf, fmt })
    return new Response(bytes, {
      headers: {
        ...cors,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${group.name.replace(/[^a-z0-9]+/gi, '-')}-statement.pdf"`,
      },
    })
  } catch (e) {
    console.error('group-report error', e)
    return json({ error: 'Could not generate the report.' }, 500)
  }
})

// deno-lint-ignore no-explicit-any
async function buildPdf({ group, cur, members, settlements, log, net, nameOf, fmt }: any): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  let page = pdf.addPage([595, 842])
  const { height } = page.getSize()
  let y = height - 60
  const ink = rgb(0.14, 0.13, 0.1)
  const coral = rgb(0.976, 0.365, 0.22)

  const line = (text: string, size = 11, f = font, dy = 16, color = ink) => {
    page.drawText(String(text), { x: 50, y, size, font: f, color })
    y -= dy
    if (y < 60) { page = pdf.addPage([595, 842]); y = height - 60 }
  }

  line('budge', 20, bold, 10, coral)
  line(`${group.name} — group statement`, 17, bold, 24)
  line(`Currency: ${cur}`, 10)
  y -= 6

  line('Current balances', 14, bold, 20)
  for (const m of members) {
    const n = net.get(m.id) ?? 0
    const label = n === 0 ? 'settled up' : n > 0 ? `is owed ${fmt(n, cur)}` : `owes ${fmt(-n, cur)}`
    line(`${m.display_name}: ${label}`, 10)
  }
  y -= 6

  line('Settlements', 14, bold, 20)
  if (settlements.length === 0) line('No settlements recorded.', 10)
  for (const s of settlements) {
    line(`${s.settled_at}   ${nameOf(s.from_member)} -> ${nameOf(s.to_member)}   ${fmt(s.amount_minor, s.currency ?? cur)}`, 10)
  }
  y -= 6

  line('Activity log', 14, bold, 20)
  if (log.length === 0) line('No activity yet.', 10)
  for (const a of log) {
    const when = String(a.created_at).slice(0, 16).replace('T', ' ')
    const amt = a.amount_minor != null ? `   (${fmt(a.amount_minor, a.currency ?? cur)})` : ''
    line(`${when}  ${a.summary}${amt}`, 9, font, 13)
  }

  return pdf.save()
}
