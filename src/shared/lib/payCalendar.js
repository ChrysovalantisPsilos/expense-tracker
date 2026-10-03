// Pay months: with the salary setting on, a month runs from payday to
// payday. The maths is one module shared with the edge functions (the
// statement and the month summary must cut the same months as the app): see
// supabase/functions/_shared/payCalendar.ts for the rule and its edge cases.
export {
  salaryShiftOf, payCalendar, payMonthStart, payMonthWindow, payMonthOf, expectedEnd, paydayHints, addMonths,
} from '../../../supabase/functions/_shared/payCalendar.ts'
