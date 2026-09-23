// Pure maths behind the financial statement (generate-report). Unit-tested in
// test/statementMath.test.js (Node strips the types).
import { fmtMinor, minorFactor, toBaseMinor } from '../_shared/money.ts'
import { isSpread, monthlyShare, paidInWindow, perYearMinor, spendRows, yearlyRules } from '../_shared/spread.ts'

// One statement line. `base_amount` is in the base currency (major units),
// or null while the row's exchange rate is pending. `yearly` marks a yearly
// subscription payment: { months, perMonthMinor (own currency), exact }.
export interface StatementRow {
  date: string
  kind: string
  category: string
  description: string
  currency: string
  amount: number
  base_amount: number | null
  yearly: { months: number; perMonthMinor: number; exact: boolean } | null
}

// The "Yearly subscriptions" section, shown when the user keeps them out of
// monthly spending: the yearly payments in the period (left out of every
// total) and what the active yearly rules cost — the Home card's figures.
export interface YearlySection {
  payments: StatementRow[]
  paidTotal: number // rated payments, base currency
  perYear: number // active yearly rules, face value as base currency (major)
  perMonth: number
  rules: { name: string; nextRun: string; currency: string; amount: number; perYear: number }[]
  foreign: boolean // some rule is in another currency (summed at face value)
}

export interface Statement {
  rows: StatementRow[] // paid in the period, oldest first
  totalSpent: number
  totalIncome: number
  byCategory: Record<string, number>
  // Rows left out of every total: foreign amounts whose rate is still pending.
  pending: { count: number; currencies: string[] }
  // How yearly subscriptions were counted: 'spread' when some counted month
  // by month, 'separate' when the user keeps them apart (see `yearly`), null
  // when the period has none.
  yearlyMode: 'spread' | 'separate' | null
  yearly: YearlySection | null // only when yearly subscriptions are kept separate
}

export interface StatementOptions {
  from?: string | null
  to?: string | null
  // profiles.yearly_separate (0068): keep yearly subscriptions out of totals.
  separateYearly?: boolean
  // my_recurring_rules rows (only read when separateYearly).
  rules?: any[]
}

// Build the statement from my_transactions rows (newest first, as the RPC
// returns them), fetched with p_spread so the yearly subscriptions paid before
// `from` that still cover the period come too.
//
// Totals follow the app's yearly-subscription setting, with the app's own
// maths (spendRows, shared with the client): by default a yearly payment
// counts its monthly parts that fall in the period — including parts of a
// charge paid before it — at the exact integer split of the Overview and
// budgets; with `separateYearly` yearly rows are left out and listed in their
// own section. The transaction list always shows each real payment in the
// period, marked as yearly.
//
// A foreign row with exchange_rate NULL is "pending": the server rates it from
// its ECB cache (fx_sync, every few minutes) as soon as the cache covers its
// date, so a row still NULL here is one the cache can't rate yet. It is never
// summed as if it were already in the base currency (or as 0): it is listed
// with no base amount and reported under `pending` (as is an earlier yearly
// payment whose parts would have counted).
export function buildStatement(txns: any[], base: string, opts: StatementOptions = {}): Statement {
  const { from = null, to = null, separateYearly = false, rules = [] } = opts
  const bf = minorFactor(base)
  // Oldest first; a base-currency row with no rate is itself (rate 1).
  const all = txns.slice().reverse().map((t) => ({
    ...t,
    // Mirrored group expenses bucket under their group's name; everything else
    // uses its category (matching the in-app breakdown).
    category: t.group_expense_id
      ? (t.group_expenses?.groups?.name ?? 'Group')
      : (t.categories?.name ?? 'Uncategorized'),
    exchange_rate: t.exchange_rate == null ? (t.currency === base ? 1 : null) : Number(t.exchange_rate),
  }))
  const listed = paidInWindow(all, from, to)
  const rated = all.filter((t) => t.exchange_rate != null)
  const spend = spendRows(rated, base, from, to, { separateYearly })

  const baseMinor = (t: any) => toBaseMinor(t.amount_minor, t.exchange_rate, t.currency, base)
  const rows: StatementRow[] = listed.map((t) => {
    const sf = minorFactor(t.currency)
    const share = monthlyShare(t)
    return {
      date: t.spent_at,
      kind: t.kind,
      category: t.category,
      description: t.description ?? '',
      currency: t.currency,
      amount: t.amount_minor / sf,
      base_amount: t.exchange_rate == null ? null : baseMinor(t) / bf,
      yearly: share && { months: share.months, perMonthMinor: share.perMonth, exact: share.exact },
    }
  })

  // Pending: every listed row without a rate, and — when yearly rows count
  // monthly — an earlier yearly payment without one that covers the period.
  const unrated = all.filter((t) => t.exchange_rate == null)
  const earlierPending = separateYearly ? []
    : unrated.filter((t) => !listed.includes(t) && spendRows([t], base, from, to).length > 0)
  const pendingRows = [...listed.filter((t) => t.exchange_rate == null), ...earlierPending]

  let spent = 0
  let income = 0
  const byMinor: Record<string, number> = {}
  for (const t of spend) {
    const v = baseMinor(t)
    if (t.kind === 'income') { income += v; continue }
    spent += v
    byMinor[t.category] = (byMinor[t.category] ?? 0) + v
  }
  const byCategory: Record<string, number> = {}
  for (const [k, v] of Object.entries(byMinor)) byCategory[k] = v / bf

  let yearly: YearlySection | null = null
  if (separateYearly) {
    const payments = rows.filter((r) => r.yearly && r.kind === 'expense')
    const y = yearlyRules(rules)
    yearly = {
      payments,
      paidTotal: payments.reduce((s, r) => s + (r.base_amount ?? 0), 0),
      perYear: y.perYear / bf,
      perMonth: y.perMonth / bf,
      rules: y.rules.map((r) => ({
        name: r.description || r.categories?.name || 'Expense',
        nextRun: r.next_run,
        currency: r.currency,
        amount: r.amount_minor / minorFactor(r.currency),
        perYear: perYearMinor(r) / minorFactor(r.currency),
      })),
      foreign: y.rules.some((r) => r.currency !== base),
    }
  }

  return {
    rows, totalSpent: spent / bf, totalIncome: income / bf, byCategory,
    pending: {
      count: pendingRows.length,
      currencies: [...new Set(pendingRows.map((t) => t.currency))].sort(),
    },
    yearlyMode: separateYearly
      ? (yearly!.payments.length > 0 || yearly!.rules.length > 0 ? 'separate' : null)
      : ([...spend, ...pendingRows].some(isSpread) ? 'spread' : null),
    yearly,
  }
}

// "2 transactions in GBP, JPY await an exchange rate and aren't in the
// totals." — or null when nothing is pending. Short: it's one PDF line.
export function pendingNote({ count, currencies }: Statement['pending']): string | null {
  if (count === 0) return null
  const [what, verb, isnt] = count === 1
    ? ['1 transaction', 'awaits', 'isn’t']
    : [`${count} transactions`, 'await', 'aren’t']
  return `${what} in ${currencies.join(', ')} ${verb} an exchange rate and ${isnt} in the totals.`
}

// How the totals treat yearly subscriptions — one short line, or null when the
// period has none.
export function yearlyNote(mode: Statement['yearlyMode']): string | null {
  if (mode === 'spread') {
    return 'Totals count yearly subscriptions month by month, including charges paid before this period.'
  }
  if (mode === 'separate') return 'Yearly subscriptions are kept out of the totals (see Yearly subscriptions).'
  return null
}

// The list's mark on a yearly payment: "Yearly · 10.00 EUR/mo" ("≈" when the
// months differ by a cent; "Every 2 years" for longer spreads).
export function yearlyLabel({ yearly: y, currency }: StatementRow): string | null {
  if (!y) return null
  const every = y.months === 12 ? 'Yearly' : `Every ${y.months / 12} years`
  return `${every} · ${y.exact ? '' : '≈'}${fmtMinor(y.perMonthMinor, currency)}/mo`
}

// Neutralise spreadsheet formula injection: text starting with a formula
// trigger gets a leading apostrophe so Excel/Sheets keep it as text.
export function safeCell(v: string): string {
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
}

type SheetCell = string | number
export interface Sheet { name: string; rows: SheetCell[][] }

// The Excel workbook's content: one sheet per entry, as rows of plain cells
// (strings and numbers only; the edge function hands each to SheetJS). Sheet
// names follow Excel's rules: at most 31 characters, none of []:*?/\, unique.
export function statementSheets(stmt: Statement, base: string, notes: string[]): Sheet[] {
  const { rows, totalSpent, totalIncome, byCategory, yearly } = stmt
  const sheets: Sheet[] = [{
    name: 'Summary',
    rows: [
      ['Financial Statement'],
      ['Base currency', base],
      [],
      ['Total income', totalIncome],
      ['Total expenses', totalSpent],
      ['Net', totalIncome - totalSpent],
      ...notes.map((n) => [n]),
      [],
      ['Spending by category'],
      ...Object.entries(byCategory).sort((a, b) => b[1] - a[1]).map(([k, v]) => [safeCell(k), v]),
    ],
  }, {
    name: 'Transactions',
    rows: [
      ['Date', 'Type', 'Category', 'Description', 'Currency', 'Amount', `Amount (${base})`, 'Yearly'],
      ...rows.map((r) => [
        r.date, r.kind, safeCell(r.category), safeCell(r.description),
        r.currency, r.amount, r.base_amount ?? 'Rate pending', yearlyLabel(r) ?? '',
      ]),
    ],
  }]
  if (yearly) {
    sheets.push({
      name: 'Yearly subscriptions',
      rows: [
        ['Yearly subscriptions (kept out of the totals)'],
        [`Paid in this period (${base})`, yearly.paidTotal],
        [`Active subscriptions per year (${base})`, yearly.perYear],
        [`Per month (${base})`, yearly.perMonth],
        ...(yearly.foreign ? [['Other currencies are added at face value (recurring entries have no exchange rate).']] : []),
        [],
        ['Payments in this period'],
        ['Date', 'Description', 'Currency', 'Amount', `Amount (${base})`],
        ...yearly.payments.map((r) => [
          r.date, safeCell(r.description || r.category), r.currency, r.amount, r.base_amount ?? 'Rate pending',
        ]),
        [],
        ['Active yearly subscriptions'],
        ['Subscription', 'Next charge', 'Currency', 'Charge', 'Per year'],
        ...yearly.rules.map((r) => [safeCell(r.name), r.nextRun, r.currency, r.amount, r.perYear]),
      ],
    })
  }
  return sheets
}
