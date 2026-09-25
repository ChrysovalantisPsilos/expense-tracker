// Savings entries: income in a category marked as savings never counts as
// income, and one "taken from my income" lowers the net (0084); an expense
// "paid from savings" is spending that leaves the net alone and draws the
// savings pot down (0085). The maths is
// one module shared with the edge functions (the PDF/Excel statement must
// treat the same entries the same way as the app): see
// supabase/functions/_shared/savings.ts for the rule.
export {
  EFFECTS, savingsIdsOf, isSavingsRow, rowEffect, savingsNoteOf, isSpending, netSign, savingsPotMinor,
} from '../../../supabase/functions/_shared/savings.ts'
