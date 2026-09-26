// The personal financial statement as a file (PDF or Excel), one copy for
// both places that make it: the app, on the device (src/features/insights/
// deviceStatement.js), and — for one release, as the fallback — the
// generate-report edge function. Neither the Supabase client, pdf-lib nor
// SheetJS is imported here: each caller passes its own (the app's session
// client and npm builds; the edge function's caller-scoped client and esm.sh
// builds), so the same code runs in the browser, in Deno and under Node's
// tests.
//
// Yearly subscriptions follow the user's app setting (profiles.
// yearly_separate, 0068): by default the totals count them month by month,
// like the app (so the fetch includes earlier yearly charges that still cover
// the period); kept separate, they're left out of the totals and get their own
// section, with the active yearly rules' cost (my_recurring_rules; foreign
// rules at the latest rate in the server's ECB cache, latest_fx_rates).
//
// Salary paid late in the month follows the user's setting too (profiles.
// salary_shift_from_day/salary_category_id, 0081): from day D it counts toward
// the next month's totals, so the fetch starts at day D of the month before
// `from` (shiftFetchFrom) and the list still shows only the period's payments.
//
// Savings (categories.is_savings, 0084): income in the user's savings
// categories is totalled as "Saved" — its own section and summary lines — and
// never as income, like the app; the part taken from income
// (transactions.savings_from_income) lowers the net. An expense paid from
// savings (transactions.paid_from_savings, 0085) is spending like any other,
// but leaves the net alone; a note says so.
//
// Every read goes through the caller's own session (RLS, and the decrypting
// my_transactions RPC for their own rows only).

import { money, type PdfLib, Statement } from '../_shared/pdf.ts'
import { categoryBars } from '../_shared/breakdown.ts'
import { salaryShiftOf, shiftFetchFrom } from '../_shared/salaryShift.ts'
import { savingsIdsOf } from '../_shared/savings.ts'
import { foreignCurrencies, type Rates } from '../_shared/ruleFx.ts'
import { STATEMENT_TEXT, type StatementText } from '../_shared/statementText.ts'
import { type FileFormat } from '../_shared/files.ts'
import {
  buildStatement, statementNotes, statementSheets, yearlyLabel,
  type Statement as StatementData, type StatementRow,
} from './statementMath.ts'


// What the PDF and the workbook are made from.
interface StatementInput {
  from: string
  to: string
  base: string
  name?: string
  stmt: StatementData
  notes: string[]
}

// The slice of SheetJS the workbook needs (0.18.5 on the edge, 0.20.3 in the app).
interface Xlsx {
  utils: {
    book_new(): unknown
    aoa_to_sheet(rows: unknown[][]): unknown
    book_append_sheet(wb: unknown, sheet: unknown, name: string): void
  }
  write(wb: unknown, opts: { type: 'array'; bookType: 'xlsx' }): ArrayBuffer | Uint8Array
}

// Read everything the statement needs with `supabase` (a client signed in as
// the user) and work out its figures. Throws on any read error.
// deno-lint-ignore no-explicit-any
export async function loadStatement(supabase: any, { from, to }: { from: string; to: string },
  text: StatementText = STATEMENT_TEXT): Promise<StatementInput> {
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
  const { data: savingsCats, error: catsErr } = await supabase.from('categories')
    .select('id, kind, is_savings').eq('is_savings', true)
  if (catsErr) throw catsErr
  const savingsIds = savingsIdsOf(savingsCats)
  let rules: { currency: string }[] = []
  let rates: Rates = {}
  if (separateYearly) {
    const { data, error: rulesErr } = await supabase.rpc('my_recurring_rules')
    if (rulesErr) throw rulesErr
    rules = data ?? []
    // Rules carry no rate: foreign ones count at the latest rate in the
    // server's ECB cache (latest_fx_rates, 0086), as the app counts them.
    const currencies = foreignCurrencies(rules, base)
    if (currencies.length) {
      const { data: fx, error: fxErr } = await supabase
        .rpc('latest_fx_rates', { p_currencies: currencies, p_base: base })
      if (fxErr) throw fxErr
      rates = Object.fromEntries((fx ?? []).map((r: { currency: string; rate: string | number }) =>
        [r.currency, Number(r.rate)]))
    }
  }

  // Oldest first; foreign rows whose rate is still pending are listed but
  // kept out of every total (see statementMath.ts).
  const stmt = buildStatement(txns ?? [], base, {
    from, to, separateYearly, rules, rates, salaryShift, savingsIds, text: text.personal,
  })
  return { from, to, base, name: profile?.display_name, stmt, notes: statementNotes(stmt, text.personal) }
}

// The file's bytes in `format`. `libs` needs only the builder that format
// uses, so the app can load just that one.
export function statementBytes(format: FileFormat, input: StatementInput,
  libs: { pdf?: PdfLib; xlsx?: Xlsx }, text: StatementText = STATEMENT_TEXT): Promise<Uint8Array> {
  if (format === 'pdf') return statementPdf(libs.pdf!, input, text)
  return Promise.resolve(statementXlsx(libs.xlsx!, input, text))
}

function statementXlsx(XLSX: Xlsx, { stmt, base, notes }: StatementInput,
  text: StatementText = STATEMENT_TEXT): Uint8Array {
  const wb = XLSX.utils.book_new()
  for (const s of statementSheets(stmt, base, notes, text.personal)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s.rows), s.name)
  }
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }))
}

async function statementPdf(lib: PdfLib, { from, to, base, stmt, notes, name }: StatementInput,
  text: StatementText = STATEMENT_TEXT): Promise<Uint8Array> {
  const t = text.personal
  const { rows, totalSpent, totalIncome, net, saved, byCategory, yearly } = stmt
  const doc = await Statement.create(lib)
  // A row whose rate is pending shows its own amount, starred (see the notes).
  const pendingCell = (r: StatementRow) => ({ text: `${money(r.amount, r.currency)} *`, tone: 'muted' as const })

  doc.header(t.title, `${from}  →  ${to}   ·   ${base}`, name)

  doc.tiles([
    { label: t.income, value: money(totalIncome, base), tone: 'positive' },
    { label: t.spent, value: money(totalSpent, base) },
    {
      label: t.net, value: `${net > 0 ? '+' : ''}${money(net, base)}`,
      tone: net < 0 ? 'negative' : net > 0 ? 'positive' : 'muted',
    },
  ])
  doc.notes(notes)

  // The app's "Where your money went": top 5 categories + "Other".
  const bars = categoryBars(Object.entries(byCategory).map(([label, value]) => ({ name: label, value })))
  if (bars.length > 0) {
    doc.panel({
      title: t.whereTitle,
      subtitle: t.whereSubtitle(money(totalSpent, base)),
      contentH: Statement.breakdownHeight(bars.length),
    }, (x, y, w) => doc.breakdown(x, y, w, bars.map((b) => ({ ...b, meta: money(b.value, base) }))))
  }

  // Savings (0084): in neither income nor spending. Both kinds in the
  // period show each subtotal too.
  if (saved) {
    doc.sectionTitle(t.savedTitle, t.savedAside)
    doc.tiles([
      { label: t.savedInPeriod, value: money(saved.total, base), tone: 'accent' },
      ...(saved.fromIncome && saved.received ? [
        { label: t.takenFromIncome, value: money(saved.fromIncome, base) },
        { label: t.received, value: money(saved.received, base) },
      ] : []),
    ], { size: 13 })
  }

  if (yearly) {
    doc.sectionTitle(t.yearlyTitle, t.yearlyAside)
    doc.tiles([
      { label: t.paidInPeriod, value: money(yearly.paidTotal, base) },
      { label: t.activePerYear, value: money(yearly.perYear, base), tone: 'accent' },
      { label: t.perMonth, value: `≈ ${money(yearly.perMonth, base)}` },
    ], { size: 13 })
    for (const n of yearly.notes) doc.muted(n)
    if (yearly.payments.length > 0) {
      doc.table(
        [
          { title: t.colPaid, width: 70 },
          { title: t.colPayment, width: 336 },
          { title: t.colAmountIn(base), width: 105, align: 'right' },
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
          { title: t.colSubscription, width: 216 },
          { title: t.colNextCharge, width: 90 },
          { title: t.colCharge, width: 105, align: 'right' },
          { title: t.colPerYear, width: 100, align: 'right' },
        ],
        yearly.rules.map((r) => [
          r.name, r.nextRun, money(r.amount, r.currency), { text: money(r.perYear, r.currency), bold: true },
        ]),
      )
    }
  }

  doc.sectionTitle(t.transactionsTitle, t.transactionsAside(rows.length))
  if (rows.length === 0) {
    doc.muted(t.noTransactions)
  } else {
    doc.table(
      [
        { title: t.colDate, width: 70 },
        { title: t.colCategory, width: 110 },
        { title: t.colDescription, width: 226 },
        { title: t.colAmountIn(base), width: 105, align: 'right' },
      ],
      rows.map((r) => {
        // Yearly payments carry their mark (the totals count them per the
        // note up top), as do expenses paid from savings; the description is
        // truncated before the mark is.
        const mark = [yearlyLabel(r, t), r.fromSavings ? t.fromSavingsMark : null].filter(Boolean).join('  ·  ')
        const income = r.kind === 'income' && !r.saved
        return [
          r.date,
          r.category,
          mark ? `${mark}  ·  ${r.description || '—'}` : (r.description || '—'),
          r.base_amount == null
            ? pendingCell(r)
            : r.saved
              ? { text: `+${money(r.base_amount)}`, tone: 'accent' as const, bold: true }
              : { text: `${income ? '+' : ''}${money(r.base_amount)}`, tone: income ? 'positive' : 'default', bold: true },
        ]
      }),
    )
  }

  return doc.save(text.footer)
}
