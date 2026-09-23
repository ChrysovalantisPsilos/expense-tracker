// Spreading a yearly subscription over the months it covers. The maths is one
// module shared with the edge functions (the PDF/Excel statement must split to
// the same cent as the app): see supabase/functions/_shared/spread.ts for the
// rules, the JS↔SQL lockstep pairs and the "keep yearly separate" setting.
export {
  ruleSpreadMonths, spreadPart, spreadDates, countsMonthly, ruleCountsMonthly,
  paidInWindow, spendRows, monthlyShare, monthlyMinor, yearlyRules,
} from '../../../supabase/functions/_shared/spread.ts'
