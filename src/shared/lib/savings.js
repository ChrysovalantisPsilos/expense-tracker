// Savings entries: income in a category marked as savings never counts as
// income, and one "taken from my income" lowers the net (0084); an expense
// "paid from savings" is spending that leaves the net alone and draws the
// savings pot down (0085). The maths is
// one module shared with the edge functions (the PDF/Excel statement must
// treat the same entries the same way as the app): see
// supabase/functions/_shared/savings.ts for the rule.
import { savingsNoteOf } from '../../../supabase/functions/_shared/savings.ts'
import { t } from './i18n/i18n.js'

export {
  EFFECTS, savingsIdsOf, isSavingsRow, rowEffect, isSpending, netSign, potSign, savingsPotMinor,
} from '../../../supabase/functions/_shared/savings.ts'

const NOTE_KEYS = { 'from income': 'fromIncome', received: 'received', 'from savings': 'fromSavings' }

// The lists' note on a row that touches savings ("from income", "received",
// "from savings"), in the app's language; null otherwise.
export function savingsNoteLabel(row, savingsIds) {
  const note = savingsNoteOf(row, savingsIds)
  return note ? t(`common:savingsNote.${NOTE_KEYS[note]}`) : null
}
