// "Salary paid late in the month counts toward the next month". The maths is
// one module shared with the edge functions (the PDF/Excel statement must
// total the same months as the app): see supabase/functions/_shared/
// salaryShift.ts for the rule and its edge cases.
import { countsFor } from '../../../supabase/functions/_shared/salaryShift.ts'
import { t, intlLocale } from './i18n/i18n.js'

export {
  salaryShiftOf, countedDate, countedInWindow, shiftFetchFrom,
} from '../../../supabase/functions/_shared/salaryShift.ts'

// The list's note on a shifted salary, in the app's language: "Counts for
// October" ("Counts for January 2027" when it moves into the next year),
// Greek «Στα έσοδα Οκτωβρίου» (the month in the genitive, which Intl gives
// for a month on its own). null when the row isn't shifted.
export function countsForLabel(row, shift) {
  const c = countsFor(row, shift)
  if (!c) return null
  const month = new Date(Date.UTC(c.year, c.month - 1, 1))
    .toLocaleString(intlLocale('en-US'), { month: 'long', timeZone: 'UTC' })
  return t(c.newYear ? 'common:countsFor.withYear' : 'common:countsFor.month', { month, year: c.year })
}
