// Pure maths behind the financial statement (statementFile.ts: made on the
// device by the app, and by generate-report as its fallback). Unit-tested in
// test/statementMath.test.js (Node strips the types).
import { fmtMinor, minorFactor, toBaseMinor } from '../_shared/money.ts'
import { isSpread, monthlyShare, paidInWindow, perYearMinor, spendRows, yearlyRules } from '../_shared/spread.ts'
import { isShifted, type SalaryShift } from '../_shared/salaryShift.ts'
import { CONVERTED_NOTE, missingRatesNote, type Rates, rulesInBase } from '../_shared/ruleFx.ts'
import { EFFECTS, type Effect, isSpending, netSign, rowEffect, savingsSource } from '../_shared/savings.ts'
import { type PersonalText, STATEMENT_TEXT } from '../_shared/statementText.ts'

// Its words come from _shared/statementText.ts: every function that prints
// text takes the `text` to use, English by default.

// One statement line. `base_amount` is in the base currency (major units),
// or null while the row's exchange rate is pending. `yearly` marks a yearly
// subscription payment: { months, perMonthMinor (own currency), exact }.
// `saved` marks a savings entry (0084: income-kind, but never income) with
// where the money came from, else null; `fromSavings` an expense paid from
// savings (0085: spending, but not against the net), `withVouchers` one paid
// with meal vouchers (0097: the same).
export interface StatementRow {
  date: string
  kind: string
  saved: 'from income' | 'received' | null
  fromSavings: boolean
  withVouchers: boolean
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
  // What the active yearly rules cost in the base currency (major): foreign
  // ones at the latest ECB rate, those with no rate left out (ruleFx.ts).
  perYear: number
  perMonth: number
  rules: { name: string; nextRun: string; currency: string; amount: number; perYear: number }[]
  // The lines under those totals: foreign rules converted, and any left out.
  notes: string[]
}

export interface Statement {
  rows: StatementRow[] // paid in the period, oldest first
  totalSpent: number // every expense, those paid from savings or with vouchers included
  // The part of totalSpent paid from savings (0085); 0 when none.
  spentFromSavings: number
  // The part paid with meal vouchers (0097); 0 when none.
  spentWithVouchers: number
  totalIncome: number
  // income − expenses paid from income − savings taken from income (received
  // savings and expenses paid from savings leave it alone), as on Home.
  net: number
  // The savings entries (0084), in neither income nor spending: their total
  // and its two kinds. null when the period has none.
  saved: { total: number; fromIncome: number; received: number } | null
  byCategory: Record<string, number>
  // Rows left out of every total: foreign amounts whose rate is still pending.
  pending: { count: number; currencies: string[] }
  // How yearly subscriptions were counted: 'spread' when some counted month
  // by month, 'separate' when the user keeps them apart (see `yearly`), null
  // when the period has none.
  yearlyMode: 'spread' | 'separate' | null
  yearly: YearlySection | null // only when yearly subscriptions are kept separate
  // The salary shift's day D when some salary paid or counted in the period
  // counts in another month than it was paid in (0081), else null.
  salaryShiftDay: number | null
}

export interface StatementOptions {
  from?: string | null
  to?: string | null
  // profiles.yearly_separate (0068): keep yearly subscriptions out of totals.
  separateYearly?: boolean
  // my_recurring_rules rows (only read when separateYearly).
  rules?: any[]
  // The latest ECB rate into `base` per foreign rule currency (latest_fx_rates).
  rates?: Rates
  // profiles.salary_shift_from_day/salary_category_id (0081, salaryShiftOf):
  // salary paid from day D counts toward the next month's totals.
  salaryShift?: SalaryShift | null
  // The ids of the user's savings categories (savingsIdsOf, 0084).
  savingsIds?: Set<string>
  // The statement's words (category fallbacks).
  text?: PersonalText
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
// period, marked as yearly. With the salary shift on, a salary paid from day
// D counts in the next month's totals (the fetch reaches back for the one paid
// late in the month before `from`); the list keeps its real date. Savings
// entries (income in a savings category) are totalled as "Saved", never as
// income; the ones taken from income lower the net. Expenses paid from
// savings are spending (total, by category) but leave the net alone
// (rowEffect / netSign, shared with the app).
//
// A foreign row with exchange_rate NULL is "pending": the server rates it from
// its ECB cache (fx_sync, every few minutes) as soon as the cache covers its
// date, so a row still NULL here is one the cache can't rate yet. It is never
// summed as if it were already in the base currency (or as 0): it is listed
// with no base amount and reported under `pending` (as is an earlier yearly
// payment whose parts would have counted).
export function buildStatement(txns: any[], base: string, opts: StatementOptions = {}): Statement {
  const {
    from = null, to = null, separateYearly = false, rules = [], rates = {}, salaryShift = null,
    savingsIds = new Set<string>(), text = STATEMENT_TEXT.personal,
  } = opts
  const bf = minorFactor(base)
  // Oldest first; a base-currency row with no rate is itself (rate 1).
  const all = txns.slice().reverse().map((t) => ({
    ...t,
    // Mirrored group expenses bucket under their group's name; everything else
    // uses its category (matching the in-app breakdown).
    category: t.group_expense_id
      ? (t.group_expenses?.groups?.name ?? text.groupFallback)
      : (t.categories?.name ?? text.uncategorized),
    exchange_rate: t.exchange_rate == null ? (t.currency === base ? 1 : null) : Number(t.exchange_rate),
  }))
  const listed = paidInWindow(all, from, to)
  const rated = all.filter((t) => t.exchange_rate != null)
  const spend = spendRows(rated, base, from, to, { separateYearly, salaryShift })

  const baseMinor = (t: any) => toBaseMinor(t.amount_minor, t.exchange_rate, t.currency, base)
  const rows: StatementRow[] = listed.map((t) => {
    const sf = minorFactor(t.currency)
    const share = monthlyShare(t)
    return {
      date: t.spent_at,
      kind: t.kind,
      saved: savingsSource(t, savingsIds),
      fromSavings: rowEffect(t, savingsIds) === 'expense-from-savings',
      withVouchers: rowEffect(t, savingsIds) === 'expense-from-vouchers',
      category: t.category,
      description: t.description ?? '',
      currency: t.currency,
      amount: t.amount_minor / sf,
      base_amount: t.exchange_rate == null ? null : baseMinor(t) / bf,
      yearly: share && { months: share.months, perMonthMinor: share.perMonth, exact: share.exact },
    }
  })

  // Pending: every listed row without a rate, and an earlier payment without
  // one that would count in the period — a yearly payment covering it (when
  // yearly rows count monthly) or a salary paid late in the month before.
  const unrated = all.filter((t) => t.exchange_rate == null)
  const isListed = new Set(listed)
  const earlierPending = unrated.filter((t) => !isListed.has(t)
    && spendRows([t], base, from, to, { separateYearly, salaryShift }).length > 0)
  const pendingRows = [...listed.filter((t) => t.exchange_rate == null), ...earlierPending]

  const sums = Object.fromEntries(EFFECTS.map((e) => [e, 0])) as Record<Effect, number>
  let net = 0
  const byMinor: Record<string, number> = {}
  for (const t of spend) {
    const v = baseMinor(t)
    const effect = rowEffect(t, savingsIds)
    sums[effect] += v
    net += netSign(effect) * v
    if (isSpending(effect)) byMinor[t.category] = (byMinor[t.category] ?? 0) + v
  }
  const savedTotal = sums['saved-from-income'] + sums['saved-received']
  const byCategory: Record<string, number> = {}
  for (const [k, v] of Object.entries(byMinor)) byCategory[k] = v / bf

  // A shifted salary touches this period when it was paid in it (and counts
  // in the next) or counts in it (paid late in the month before).
  const shiftTouches = all.some((t) => isShifted(t, salaryShift)
    && (paidInWindow([t], from, to).length > 0 || spendRows([t], base, from, to, { salaryShift }).length > 0))

  let yearly: YearlySection | null = null
  if (separateYearly) {
    const payments = rows.filter((r) => r.yearly && r.kind === 'expense')
    const y = yearlyRules(rules)
    const fx = rulesInBase(y.rules, base, rates)
    const cost = yearlyRules(fx.rules)
    yearly = {
      payments,
      paidTotal: payments.reduce((s, r) => s + (r.base_amount ?? 0), 0),
      perYear: cost.perYear / bf,
      perMonth: cost.perMonth / bf,
      rules: y.rules.map((r) => ({
        name: r.description || r.categories?.name || text.ruleFallback,
        nextRun: r.next_run,
        currency: r.currency,
        amount: r.amount_minor / minorFactor(r.currency),
        perYear: perYearMinor(r) / minorFactor(r.currency),
      })),
      notes: [
        ...(fx.converted ? [CONVERTED_NOTE] : []),
        missingRatesNote(fx.missing, fmtMinor),
      ].filter((n): n is string => n != null),
    }
  }

  return {
    rows,
    totalSpent: EFFECTS.filter(isSpending).reduce((s, e) => s + sums[e], 0) / bf,
    spentFromSavings: sums['expense-from-savings'] / bf,
    spentWithVouchers: sums['expense-from-vouchers'] / bf,
    totalIncome: sums.income / bf,
    net: net / bf,
    saved: savedTotal === 0 ? null : {
      total: savedTotal / bf, fromIncome: sums['saved-from-income'] / bf, received: sums['saved-received'] / bf,
    },
    byCategory,
    pending: {
      count: pendingRows.length,
      currencies: [...new Set(pendingRows.map((t) => t.currency))].sort(),
    },
    yearlyMode: separateYearly
      ? (yearly!.payments.length > 0 || yearly!.rules.length > 0 ? 'separate' : null)
      : ([...spend, ...pendingRows].some(isSpread) ? 'spread' : null),
    yearly,
    salaryShiftDay: shiftTouches ? salaryShift!.fromDay : null,
  }
}

// "2 transactions in GBP, JPY await an exchange rate and aren't in the
// totals." — or null when nothing is pending. Short: it's one PDF line.
export function pendingNote(
  { count, currencies }: Statement['pending'], text = STATEMENT_TEXT.personal,
): string | null {
  return count === 0 ? null : text.pending(count, currencies)
}

// How the totals treat yearly subscriptions — one short line, or null when the
// period has none.
export function yearlyNote(mode: Statement['yearlyMode'], text = STATEMENT_TEXT.personal): string | null {
  if (mode === 'spread') return text.yearlySpread
  if (mode === 'separate') return text.yearlySeparate
  return null
}

// How the totals treat savings — one short line, or null when the period has
// none. Both kinds are saved; only those taken from income lower the net.
export function savingsNote(saved: Statement['saved'], text = STATEMENT_TEXT.personal): string | null {
  if (!saved) return null
  return saved.fromIncome > 0 ? text.savingsFromIncome : text.savingsReceived
}

// How the totals treat expenses paid from savings (0085) — one short line, or
// null when the period has none.
export function fromSavingsNote(
  spentFromSavings: Statement['spentFromSavings'], text = STATEMENT_TEXT.personal,
): string | null {
  return spentFromSavings > 0 ? text.fromSavings : null
}

// How the totals treat expenses paid with meal vouchers (0097) — one short
// line, or null when the period has none.
export function withVouchersNote(
  spentWithVouchers: Statement['spentWithVouchers'], text = STATEMENT_TEXT.personal,
): string | null {
  return spentWithVouchers > 0 ? text.withVouchers : null
}

// How the totals treat salary paid late in the month — one short line, or
// null when no such salary touches the period.
export function salaryNote(fromDay: Statement['salaryShiftDay'], text = STATEMENT_TEXT.personal): string | null {
  return fromDay == null ? null : text.salary(fromDay)
}

// Every note that applies to `stmt`, in the order the statement prints them.
export function statementNotes(stmt: Statement, text = STATEMENT_TEXT.personal): string[] {
  return [
    pendingNote(stmt.pending, text), yearlyNote(stmt.yearlyMode, text), salaryNote(stmt.salaryShiftDay, text),
    savingsNote(stmt.saved, text), fromSavingsNote(stmt.spentFromSavings, text),
    withVouchersNote(stmt.spentWithVouchers, text),
  ].filter((n): n is string => n != null)
}

// The list's mark on a yearly payment: "Yearly · 10.00 EUR/mo" ("≈" when the
// months differ by a cent; "Every 2 years" for longer spreads).
export function yearlyLabel({ yearly: y, currency }: StatementRow, text = STATEMENT_TEXT.personal): string | null {
  if (!y) return null
  const every = y.months === 12 ? text.yearly : text.everyYears(y.months / 12)
  return `${every} · ${y.exact ? '' : '≈'}${fmtMinor(y.perMonthMinor, currency)}${text.perMonthSuffix}`
}

// Neutralise spreadsheet formula injection: text starting with a formula
// trigger gets a leading apostrophe so Excel/Sheets keep it as text.
export function safeCell(v: string): string {
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
}

// The Transactions sheet's Type column: "income", "expense", "expense (from
// savings)", "expense (meal vouchers)", "saved (from income)" or "saved
// (received)".
const typeLabel = (r: StatementRow, text: PersonalText): string => {
  const kind = text.kind[r.kind] ?? r.kind
  if (r.saved) return text.savedFrom[r.saved]
  return r.fromSavings ? text.kindFromSavings(kind) : r.withVouchers ? text.kindWithVouchers(kind) : kind
}

type SheetCell = string | number
export interface Sheet { name: string; rows: SheetCell[][] }

// The Excel workbook's content: one sheet per entry, as rows of plain cells
// (strings and numbers only; the edge function hands each to SheetJS). Sheet
// names follow Excel's rules: at most 31 characters, none of []:*?/\, unique.
export function statementSheets(
  stmt: Statement, base: string, notes: string[], text = STATEMENT_TEXT.personal,
): Sheet[] {
  const { rows, totalSpent, spentFromSavings, spentWithVouchers, totalIncome, net, saved, byCategory, yearly } = stmt
  const t = text
  const sheets: Sheet[] = [{
    name: t.sheetSummary,
    rows: [
      [t.summaryHeading],
      [t.baseCurrency, base],
      [],
      [t.totalIncome, totalIncome],
      [t.totalExpenses, totalSpent],
      ...(spentFromSavings > 0 ? [[t.paidFromSavings, spentFromSavings]] : []),
      ...(spentWithVouchers > 0 ? [[t.paidWithVouchers, spentWithVouchers]] : []),
      [t.net, net],
      ...(saved ? [[t.savedNotIncome, saved.total]] : []),
      // Both kinds in the period: each subtotal too.
      ...(saved && saved.fromIncome && saved.received
        ? [[t.savedFromIncome, saved.fromIncome], [t.savedReceived, saved.received]]
        : []),
      ...notes.map((n) => [n]),
      [],
      [t.spendingByCategory],
      ...Object.entries(byCategory).sort((a, b) => b[1] - a[1]).map(([k, v]) => [safeCell(k), v]),
    ],
  }, {
    name: t.sheetTransactions,
    rows: [
      [t.colDate, t.colType, t.colCategory, t.colDescription, t.colCurrency, t.colAmount, t.colAmountIn(base), t.colYearly],
      ...rows.map((r) => [
        r.date, typeLabel(r, t), safeCell(r.category), safeCell(r.description),
        r.currency, r.amount, r.base_amount ?? t.ratePending, yearlyLabel(r, t) ?? '',
      ]),
    ],
  }]
  if (yearly) {
    sheets.push({
      name: t.sheetYearly,
      rows: [
        [t.yearlyHeading],
        [t.paidInPeriodIn(base), yearly.paidTotal],
        [t.activePerYearIn(base), yearly.perYear],
        [t.perMonthIn(base), yearly.perMonth],
        ...yearly.notes.map((n) => [n]),
        [],
        [t.paymentsInPeriod],
        [t.colDate, t.colDescription, t.colCurrency, t.colAmount, t.colAmountIn(base)],
        ...yearly.payments.map((r) => [
          r.date, safeCell(r.description || r.category), r.currency, r.amount, r.base_amount ?? t.ratePending,
        ]),
        [],
        [t.activeYearly],
        [t.colSubscription, t.colNextCharge, t.colCurrency, t.colCharge, t.colPerYear],
        ...yearly.rules.map((r) => [safeCell(r.name), r.nextRun, r.currency, r.amount, r.perYear]),
      ],
    })
  }
  return sheets
}
