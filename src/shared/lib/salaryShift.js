// "Salary paid late in the month counts toward the next month". The maths is
// one module shared with the edge functions (the PDF/Excel statement must
// total the same months as the app): see supabase/functions/_shared/
// salaryShift.ts for the rule and its edge cases.
export {
  salaryShiftOf, countedDate, countedInWindow, shiftFetchFrom, countsForLabel,
} from '../../../supabase/functions/_shared/salaryShift.ts'
