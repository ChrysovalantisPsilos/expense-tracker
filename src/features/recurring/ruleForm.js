// A recurring rule's page edits the rule with Add's own form (EntryFields +
// the Repeat section, always on there): the rule ↔ that form's state. Pure —
// unit-tested in test/entryForm.test.js.
import { entryColumns, formFromRow } from '../transactions/entryForm.js'
import { repeatDraft, repeatRuleFields } from './recurringMath.js'

// A saved rule → { form, draft }: the entry fields (the date field is its next
// charge) and the Repeat section's draft.
export function ruleToForm(rule) {
  return { form: formFromRow(rule, rule.next_run), draft: repeatDraft(rule) }
}

// The form and the Repeat draft → the fields save_recurring_rule takes. The
// date field is the next charge; the schedule, end date, reminder and paused
// come from the draft. A rule pays from the bank or savings only (meal
// vouchers pay as you go: recurring_rules has no such column). Every field is
// sent, so the rule ends up exactly as the form shows it (the server drops a
// savings flag that doesn't fit the kind).
export function ruleFromForm(form, draft, { isSavings = false } = {}) {
  const { paid_with_vouchers: _vouchers, ...columns } = entryColumns(form, { isSavings })
  return {
    kind: form.kind,
    ...columns,
    ...repeatRuleFields(draft),
    next_run: form.date,
  }
}
