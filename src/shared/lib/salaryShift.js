// "Salary paid late in the month counts toward the next month". The maths is
// one module shared with the edge functions (the PDF/Excel statement must
// total the same months as the app): see supabase/functions/_shared/
// salaryShift.ts for the rule and its edge cases.
import { countedDate, countsFor } from '../../../supabase/functions/_shared/salaryShift.ts'
import { t } from './i18n/i18n.js'
import { monthAlone } from './dates.js'

export {
  salaryShiftOf, countedDate, countedInWindow, shiftFetchFrom,
} from '../../../supabase/functions/_shared/salaryShift.ts'

// The date the newest salary in counts on (`row`: the newest income row in
// the salary category paid from day D of this month, or none), when that is
// next month (`nextMonth`, its 1st) or later: the period pickers then offer
// next month. null otherwise.
export function newestCountedDate(row, shift, nextMonth) {
  const newest = row ? countedDate(row, shift) : null
  return newest && newest >= nextMonth ? newest : null
}

// The list's note on a shifted salary, in the app's language: "Counts for
// October" ("Counts for January 2027" when it moves into the next year),
// Greek «Στα έσοδα Οκτωβρίου» (the month in the genitive: dates.monthAlone).
// null when the row isn't shifted.
export function countsForLabel(row, shift) {
  const c = countsFor(row, shift)
  if (!c) return null
  const month = monthAlone(c.month)
  return t(c.newYear ? 'common:countsFor.withYear' : 'common:countsFor.month', { month, year: c.year })
}
