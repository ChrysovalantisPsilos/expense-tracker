// Edge Function: group-report
// Builds a brand-matched PDF statement for a group: where everyone stands,
// who owes whom (the app's settle-up plan), the expenses, the settlement
// history and the full immutable audit trail. verify_jwt = true.
//
// Auth/isolation: the function uses the CALLER'S JWT with the anon key, so RLS
// restricts everything to groups the caller is a member of. A non-member gets
// an empty group lookup → 403. No service-role key is used. Expenses,
// settlements and the audit trail are encrypted at rest, so they come from the
// decrypting, membership-checked group_ledger / group_audit_entries RPCs.

import { PDFDocument } from 'https://esm.sh/pdf-lib@1.17.1'
import { loadBrandFonts, Statement, type Tile } from '../_shared/pdf.ts'
import { withCors, json, callerClient } from '../_shared/http.ts'
import { fileResponse } from '../_shared/files.ts'
import { simplifyDebts } from '../_shared/breakdown.ts'
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

    const [{ data: members }, { data: ledger }, { data: log }, { data: bal }] = await Promise.all([
      supabase.from('group_members').select('id, display_name').eq('group_id', group_id).order('created_at'),
      supabase.rpc('group_ledger', { p_group: group_id }),
      // No cap: the statement carries the full trail.
      supabase.rpc('group_audit_entries', { p_group: group_id, p_limit: null }),
      supabase.rpc('group_balances', { p_group: group_id }),
    ])

    const net = new Map<string, number>((bal ?? []).map((b: any) => [b.member_id, Number(b.net_minor)]))
    const bytes = await buildPdf({
      group, members: members ?? [], expenses: ledger?.expenses ?? [], settlements: ledger?.settlements ?? [],
      log: log ?? [], net,
    })
    return fileResponse(bytes, 'pdf', `${group.name}-statement.pdf`)
  } catch (e) {
    console.error('group-report error', e)
    return json({ error: 'Could not generate the report.' }, 500)
  }
}))

// deno-lint-ignore no-explicit-any
async function buildPdf({ group, members, expenses, settlements, log, net }: any): Promise<Uint8Array> {
  const cur: string = group.currency
  const nameOf = (id: string) => members.find((m: any) => m.id === id)?.display_name ?? '—'
  const pdf = await PDFDocument.create()
  const fonts = await loadBrandFonts(pdf)
  const doc = new Statement(pdf, fonts)

  const today = new Date().toISOString().slice(0, 10)
  doc.header('Group statement', `${cur}   ·   ${members.length} members   ·   as of ${today}`, group.name)

  // Expenses count in the group currency; one whose rate is still pending
  // counts for nothing yet (as in the app's balances).
  const counted = expenses.filter((e: any) => e.group_amount_minor != null)
  const total = counted.reduce((s: number, e: any) => s + Number(e.group_amount_minor), 0)
  doc.tiles([
    { label: 'Total spent', value: fmt(total, cur) },
    { label: 'Expenses', value: String(expenses.length) },
    { label: 'Settlements', value: String(settlements.length) },
  ])

  // Balances (kit BalanceTile grid): + is owed, − owes, muted when settled.
  if (members.length > 0) {
    const tiles: Tile[] = members.map((m: any) => {
      const n = net.get(m.id) ?? 0
      if (n > 0) return { label: m.display_name, value: `+${fmt(n, cur)}`, tone: 'positive' }
      if (n < 0) return { label: m.display_name, value: `−${fmt(-n, cur)}`, tone: 'negative' }
      return { label: m.display_name, value: 'Settled up', tone: 'muted' }
    })
    const columns = members.length > 4 ? 3 : 2
    doc.panel({ title: 'Balances', contentH: Statement.tilesHeight(tiles.length, columns, 12) },
      (x, y, w) => doc.tiles(tiles, { columns, size: 12, x, y, w }))
  }

  // Who owes whom: the app's settle-up plan (fewest payments).
  const plan = simplifyDebts(net as Map<string, number>)
  if (plan.length > 0) {
    doc.panel({
      title: 'Who owes whom',
      subtitle: `${plan.length} ${plan.length === 1 ? 'payment settles' : 'payments settle'} everyone up`,
      contentH: Statement.transfersHeight(plan.length),
    }, (x, y, w) => doc.transfers(x, y, w, plan.map((t) => ({
      from: nameOf(t.from), to: nameOf(t.to), amount: fmt(t.amount, cur),
    }))))
  } else if (members.length > 0) {
    doc.notes(['Everyone is settled up.'])
  }

  doc.sectionTitle('Expenses', `${expenses.length} in total`)
  if (expenses.length === 0) {
    doc.muted('No expenses yet.')
  } else {
    doc.table(
      [
        { title: 'Date', width: 70 },
        { title: 'Expense', width: 196 },
        { title: 'Paid by', width: 110 },
        { title: 'Split', width: 45, align: 'right' },
        { title: 'Amount', width: 90, align: 'right' },
      ],
      expenses.map((e: any) => {
        const foreign = e.currency && e.currency !== cur
        const what = e.description || 'Expense'
        return [
          String(e.spent_at).slice(0, 10),
          foreign ? `${what}  ·  ${fmt(e.amount_minor, e.currency)}` : what,
          nameOf(e.paid_by),
          String((e.expense_splits ?? []).length),
          e.group_amount_minor == null
            ? { text: 'Rate pending', tone: 'muted' as const }
            : { text: fmt(e.group_amount_minor, cur), bold: true },
        ]
      }),
    )
  }

  doc.sectionTitle('Settlements')
  if (settlements.length === 0) {
    doc.muted('No settlements recorded.')
  } else {
    doc.table(
      [
        { title: 'Date', width: 70 },
        { title: 'From', width: 160 },
        { title: 'To', width: 160 },
        { title: 'Amount', width: 121, align: 'right' },
      ],
      settlements.map((s: any) => [
        String(s.settled_at).slice(0, 10),
        nameOf(s.from_member),
        nameOf(s.to_member),
        { text: fmt(s.amount_minor, s.currency ?? cur), bold: true },
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
        { title: 'Activity', width: 315 },
        { title: 'Amount', width: 100, align: 'right' },
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
