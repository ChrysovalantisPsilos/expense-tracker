// Savings entries: income in a category marked as savings never counts as
// income, and one "taken from my income" lowers the net (0084). The maths is
// one module shared with the edge functions (the PDF/Excel statement must
// treat the same entries the same way as the app): see
// supabase/functions/_shared/savings.ts for the rule.
export {
  savingsIdsOf, isSavingsRow, rowEffect, savingsSource, netSign, withoutSavings, savedMinor,
} from '../../../supabase/functions/_shared/savings.ts'
