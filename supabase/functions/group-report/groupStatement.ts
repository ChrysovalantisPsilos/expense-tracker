// The group statement PDF, one copy for both places that make it: the app, on
// the device (src/features/groups/deviceGroupStatement.js), and — for one
// release, as the fallback — the group-report edge function. It shows where
// everyone stands, who owes whom (the app's settle-up plan), the expenses,
// the settlement history and the full immutable audit trail.
//
// Neither the Supabase client nor pdf-lib is imported here; each caller
// passes its own. Reads run as the caller, so RLS limits them to groups the
// caller is a member of (a non-member gets no group, and loadGroupStatement
// returns null). Expenses, settlements and the audit trail are encrypted at
// rest, so they come from the decrypting, membership-checked group_ledger /
// group_audit_entries RPCs.

import { type PdfLib, Statement, type Tile } from '../_shared/pdf.ts'
import { simplifyDebts } from '../_shared/breakdown.ts'
import { fmtMinor as fmt } from '../_shared/money.ts'
import { STATEMENT_TEXT, type StatementText } from '../_shared/statementText.ts'

// deno-lint-ignore no-explicit-any
type Row = any

interface GroupStatementInput {
  group: { id: string; name: string; currency: string }
  members: Row[]
  expenses: Row[]
  settlements: Row[]
  log: Row[]
  net: Map<string, number>
}

// Everything the statement shows, read as the caller; null when the caller
// can't see the group.
// deno-lint-ignore no-explicit-any
export async function loadGroupStatement(supabase: any, groupId: string): Promise<GroupStatementInput | null> {
  const { data: group } = await supabase
    .from('groups').select('id, name, currency').eq('id', groupId).maybeSingle()
  if (!group) return null

  const [{ data: members }, { data: ledger }, { data: log }, { data: bal }] = await Promise.all([
    supabase.from('group_members').select('id, display_name').eq('group_id', groupId).order('created_at'),
    supabase.rpc('group_ledger', { p_group: groupId }),
    // No cap: the statement carries the full trail.
    supabase.rpc('group_audit_entries', { p_group: groupId, p_limit: null }),
    supabase.rpc('group_balances', { p_group: groupId }),
  ])

  return {
    group,
    members: members ?? [],
    expenses: ledger?.expenses ?? [],
    settlements: ledger?.settlements ?? [],
    log: log ?? [],
    net: new Map<string, number>((bal ?? []).map((b: Row) => [b.member_id, Number(b.net_minor)])),
  }
}

// `today` (YYYY-MM-DD, UTC) is the "as of" date in the header.
export async function groupStatementPdf(
  lib: PdfLib, { group, members, expenses, settlements, log, net }: GroupStatementInput,
  { today = new Date().toISOString().slice(0, 10), text = STATEMENT_TEXT }: { today?: string; text?: StatementText } = {},
): Promise<Uint8Array> {
  const t = text.group
  const cur: string = group.currency
  const nameOf = (id: string) => members.find((m: Row) => m.id === id)?.display_name ?? t.unknownMember
  const doc = await Statement.create(lib)

  doc.header(t.title, t.meta(cur, members.length, today), group.name)

  // Expenses count in the group currency; one whose rate is still pending
  // counts for nothing yet (as in the app's balances).
  const counted = expenses.filter((e: Row) => e.group_amount_minor != null)
  const total = counted.reduce((s: number, e: Row) => s + Number(e.group_amount_minor), 0)
  doc.tiles([
    { label: t.totalSpent, value: fmt(total, cur) },
    { label: t.expenses, value: String(expenses.length) },
    { label: t.settlements, value: String(settlements.length) },
  ])

  // Balances (kit BalanceTile grid): + is owed, − owes, muted when settled.
  if (members.length > 0) {
    const tiles: Tile[] = members.map((m: Row) => {
      const n = net.get(m.id) ?? 0
      if (n > 0) return { label: m.display_name, value: `+${fmt(n, cur)}`, tone: 'positive' }
      if (n < 0) return { label: m.display_name, value: `−${fmt(-n, cur)}`, tone: 'negative' }
      return { label: m.display_name, value: t.settledUp, tone: 'muted' }
    })
    const columns = members.length > 4 ? 3 : 2
    doc.panel({ title: t.balances, contentH: Statement.tilesHeight(tiles.length, columns, 12) },
      (x, y, w) => doc.tiles(tiles, { columns, size: 12, x, y, w }))
  }

  // Who owes whom: the app's settle-up plan (fewest payments).
  const plan = simplifyDebts(net)
  if (plan.length > 0) {
    doc.panel({
      title: t.whoOwesWhom,
      subtitle: t.paymentsSettle(plan.length),
      contentH: Statement.transfersHeight(plan.length),
    }, (x, y, w) => doc.transfers(x, y, w, plan.map((p) => ({
      from: nameOf(p.from), to: nameOf(p.to), amount: fmt(p.amount, cur),
    }))))
  } else if (members.length > 0) {
    doc.notes([t.everyoneSettled])
  }

  doc.sectionTitle(t.expenses, t.expensesAside(expenses.length))
  if (expenses.length === 0) {
    doc.muted(t.noExpenses)
  } else {
    doc.table(
      [
        { title: t.colDate, width: 70 },
        { title: t.colExpense, width: 196 },
        { title: t.colPaidBy, width: 110 },
        { title: t.colSplit, width: 45, align: 'right' },
        { title: t.colAmount, width: 90, align: 'right' },
      ],
      expenses.map((e: Row) => {
        const foreign = e.currency && e.currency !== cur
        const what = e.description || t.expenseFallback
        return [
          String(e.spent_at).slice(0, 10),
          foreign ? `${what}  ·  ${fmt(e.amount_minor, e.currency)}` : what,
          nameOf(e.paid_by),
          String((e.expense_splits ?? []).length),
          e.group_amount_minor == null
            ? { text: t.ratePending, tone: 'muted' as const }
            : { text: fmt(e.group_amount_minor, cur), bold: true },
        ]
      }),
    )
  }

  doc.sectionTitle(t.settlements)
  if (settlements.length === 0) {
    doc.muted(t.noSettlements)
  } else {
    doc.table(
      [
        { title: t.colDate, width: 70 },
        { title: t.colFrom, width: 160 },
        { title: t.colTo, width: 160 },
        { title: t.colAmount, width: 121, align: 'right' },
      ],
      settlements.map((s: Row) => [
        String(s.settled_at).slice(0, 10),
        nameOf(s.from_member),
        nameOf(s.to_member),
        { text: fmt(s.amount_minor, s.currency ?? cur), bold: true },
      ]),
    )
  }

  doc.sectionTitle(t.activityTitle)
  if (log.length === 0) {
    doc.muted(t.noActivity)
  } else {
    doc.table(
      [
        { title: t.colWhen, width: 96 },
        { title: t.colActivity, width: 315 },
        { title: t.colAmount, width: 100, align: 'right' },
      ],
      log.map((a: Row) => [
        String(a.created_at).slice(0, 16).replace('T', ' '),
        a.summary,
        a.amount_minor != null ? fmt(a.amount_minor, a.currency ?? cur) : '—',
      ]),
    )
  }

  return doc.save(text.footer)
}
