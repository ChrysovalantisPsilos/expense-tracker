// Edge Function: group-report
// Builds a brand-matched PDF statement for a group: current balances,
// settlement history, and the full immutable audit trail. verify_jwt = true.
//
// Auth/isolation: the function uses the CALLER'S JWT with the anon key, so RLS
// restricts everything to groups the caller is a member of. A non-member gets
// an empty group lookup → 403. No service-role key is used. Settlements and
// the audit trail are encrypted at rest, so they come from the decrypting,
// membership-checked group_ledger / group_audit_entries RPCs.

import { PDFDocument } from 'https://esm.sh/pdf-lib@1.17.1'
import { BRAND, loadBrandFonts, Statement } from '../_shared/pdf.ts'
import { withCors, json, callerClient } from '../_shared/http.ts'
import { fmtMinor as fmt } from '../_shared/money.ts'

Deno.serve(withCors(async (req) => {
  try {
    const { group_id } = await req.json()
    if (!group_id || typeof group_id !== 'string') return json({ error: 'group_id is required' }, 400)

    const supabase = callerClient(req)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return json({ error: 'not authenticated' }, 401)
    // Per-caller quota (keyed on the caller's own uid server-side). Fails closed.
    const { data: allowed, error: quotaErr } = await supabase.rpc('consume_quota', { p_scope: 'group-report' })
    if (quotaErr) throw quotaErr
    if (allowed !== true) return json({ error: 'Too many report requests. Please try again later.' }, 429)

    const { data: group } = await supabase
      .from('groups').select('id, name, currency').eq('id', group_id).maybeSingle()
    if (!group) return json({ error: 'not allowed for this group' }, 403)
    const cur = group.currency

    const [{ data: members }, { data: ledger }, { data: log }, { data: bal }] = await Promise.all([
      supabase.from('group_members').select('id, display_name').eq('group_id', group_id).order('created_at'),
      supabase.rpc('group_ledger', { p_group: group_id }),
      // No cap: the statement carries the full trail.
      supabase.rpc('group_audit_entries', { p_group: group_id, p_limit: null }),
      supabase.rpc('group_balances', { p_group: group_id }),
    ])
    const settlements = ledger?.settlements

    const nameOf = (id: string) => (members ?? []).find((m: any) => m.id === id)?.display_name ?? '—'
    const net = new Map<string, number>((bal ?? []).map((b: any) => [b.member_id, Number(b.net_minor)]))

    const bytes = await buildPdf({ group, cur, members: members ?? [], settlements: settlements ?? [], log: log ?? [], net, nameOf })
    return new Response(bytes, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${group.name.replace(/[^a-z0-9]+/gi, '-')}-statement.pdf"`,
      },
    })
  } catch (e) {
    console.error('group-report error', e)
    return json({ error: 'Could not generate the report.' }, 500)
  }
}))

// deno-lint-ignore no-explicit-any
async function buildPdf({ group, cur, members, settlements, log, net, nameOf }: any): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const fonts = await loadBrandFonts(pdf)
  const doc = new Statement(pdf, fonts)

  doc.header('Group statement', `Currency: ${cur}`, group.name)

  doc.sectionTitle('Current balances')
  if (members.length === 0) {
    doc.muted('No members yet.')
  } else {
    doc.rows(members.map((m: any) => {
      const n = net.get(m.id) ?? 0
      if (n === 0) return { left: m.display_name, right: 'settled up', rightColor: BRAND.muted }
      if (n > 0) return { left: m.display_name, right: `is owed ${fmt(n, cur)}`, rightColor: BRAND.green }
      return { left: m.display_name, right: `owes ${fmt(-n, cur)}`, rightColor: BRAND.red }
    }))
  }

  doc.sectionTitle('Settlements')
  if (settlements.length === 0) {
    doc.muted('No settlements recorded.')
  } else {
    doc.table(
      [
        { title: 'Date', width: 78 },
        { title: 'From', width: 150 },
        { title: 'To', width: 150 },
        { title: 'Amount', width: 77, align: 'right' },
      ],
      settlements.map((s: any) => [
        String(s.settled_at).slice(0, 10),
        nameOf(s.from_member),
        nameOf(s.to_member),
        fmt(s.amount_minor, s.currency ?? cur),
      ]),
    )
  }

  doc.sectionTitle('Activity log')
  if (log.length === 0) {
    doc.muted('No activity yet.')
  } else {
    doc.table(
      [
        { title: 'When', width: 96 },
        { title: 'Activity', width: 289 },
        { title: 'Amount', width: 70, align: 'right' },
      ],
      log.map((a: any) => [
        String(a.created_at).slice(0, 16).replace('T', ' '),
        a.summary,
        a.amount_minor != null ? fmt(a.amount_minor, a.currency ?? cur) : '—',
      ]),
    )
  }

  doc.finish()
  return pdf.save()
}
