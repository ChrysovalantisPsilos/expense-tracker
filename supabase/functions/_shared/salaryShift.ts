// "Salary paid late in the month counts toward the next month" (pure, no I/O).
// One copy for the client and the edge functions: src/shared/lib/salaryShift.js
// re-exports this module, spread.ts's spendRows applies it, and
// generate-report's statement gets it through spendRows too, so the app's
// monthly figures and the PDF/Excel statement agree to the cent.
//
// The rule (profiles.salary_shift_from_day + salary_category_id, 0081): an
// INCOME row in the user's salary category paid on or after day D of its
// month counts toward the NEXT month. D is clamped to the month's length
// ("from day 31" means the 28th/29th in February, the 30th in April), so it
// always reads "from that day to the month's end". Salary paid before day D
// stays in its own month. Only totals move: lists keep the real payment on its
// real date (with a "Counts for <Month>" note), and budgets are expense-only,
// so they never see it. The setting is off while either column is null.
//
// For sums a shifted row is re-dated to the 1st of the next month (countedRow)
// — the same trick spendRows plays with a yearly subscription's parts — so the
// existing month keys, period windows and toBaseMinor sums need no special
// case. A fetch for a window starting on the 1st must reach back into the
// previous month to find the salary that counts in it (shiftFetchFrom).
//
// No SQL twin: nothing on the server sums income by month (budget alerts, the
// weekly digest and send-reminders read expenses or recurring rules only). If
// a server-side income-by-month figure is ever added, give it a lockstep SQL
// copy of isShifted/countedDate.

// deno-lint-ignore no-explicit-any
type Row = any

export interface SalaryShift {
  fromDay: number // 1..31
  categoryId: string
}

// The user's setting as the maths needs it, or null when it's off.
export function salaryShiftOf(
  profile: { salary_shift_from_day?: number | null; salary_category_id?: string | null } | null | undefined,
): SalaryShift | null {
  const d = Number(profile?.salary_shift_from_day)
  const c = profile?.salary_category_id
  return Number.isInteger(d) && d >= 1 && d <= 31 && c ? { fromDay: d, categoryId: c } : null
}

const pad2 = (x: number) => String(x).padStart(2, '0')
const parts = (iso: string) => String(iso).split('-').map(Number)

// The day the shift starts in month `m` (1-based) of year `y`: D, or the
// month's last day when the month is shorter.
function shiftStartDay(y: number, m: number, fromDay: number): number {
  return Math.min(fromDay, new Date(Date.UTC(y, m, 0)).getUTCDate())
}

// Does this row count toward the month after the one it was paid in?
export function isShifted(row: Row, shift: SalaryShift | null): boolean {
  if (!shift || row?.kind !== 'income' || !row.category_id || row.category_id !== shift.categoryId) return false
  const [y, m, d] = parts(row.spent_at)
  return d >= shiftStartDay(y, m, shift.fromDay)
}

// The date a row counts on in monthly sums: its payment date, or the 1st of
// the next month for a shifted salary (31 Dec 2025 → 1 Jan 2026).
export function countedDate(row: Row, shift: SalaryShift | null): string {
  if (!isShifted(row, shift)) return row.spent_at
  const [y, m] = parts(row.spent_at)
  return m === 12 ? `${y + 1}-01-01` : `${y}-${pad2(m + 1)}-01`
}

// The row as monthly sums see it: a shifted salary re-dated to its counted
// date, anything else unchanged (the same object).
export const countedRow = (row: Row, shift: SalaryShift | null): Row =>
  isShifted(row, shift) ? { ...row, spent_at: countedDate(row, shift) } : row

// Where a fetch for a window starting at `from` must begin so the salary that
// counts in it comes too: day D (clamped) of the month before `from`'s — or
// `from` itself when the setting is off, there's no lower bound (all time),
// or `from` is already earlier. Rows the wider fetch adds that don't count in
// the window are dropped again by spendRows (totals) and paidInWindow (lists).
export function shiftFetchFrom(from: string | null | undefined, shift: SalaryShift | null): string | null | undefined {
  if (!from || !shift) return from
  const [y, m] = parts(from)
  const py = m === 1 ? y - 1 : y
  const pm = m === 1 ? 12 : m - 1
  const start = `${py}-${pad2(pm)}-${pad2(shiftStartDay(py, pm, shift.fromDay))}`
  return start < from ? start : from
}

// The rows that count in [from, to] (either bound may be null): each by its
// counted date, so a shifted salary is listed in the month it counts for
// (Home's Income card shows 28 Aug's salary under September, with its real
// date and a "Counts for September" note) and not in the month it was paid.
export function countedInWindow(
  rows: Row[], from: string | null | undefined, to: string | null | undefined, shift: SalaryShift | null,
): Row[] {
  return rows.filter((r) => {
    const d = countedDate(r, shift)
    return (!from || d >= from) && (!to || d <= to)
  })
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December']

// The list's note on a shifted salary: "Counts for October" (with the year
// when it moves into the next one: "Counts for January 2027"), else null.
export function countsForLabel(row: Row, shift: SalaryShift | null): string | null {
  if (!isShifted(row, shift)) return null
  const [y, m] = parts(countedDate(row, shift))
  return `Counts for ${MONTHS[m - 1]}${y !== parts(row.spent_at)[0] ? ` ${y}` : ''}`
}
