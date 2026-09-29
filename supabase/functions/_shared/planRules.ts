// Which recurring rules Plan mode shows and counts (pure, no I/O). One copy
// for the app (src/features/plan/planMath.planRules) and the ai-helper edge
// function's "What-if in your own words", which offers the model the same
// payments and income the plan lists.
//
// A rule is in the plan when it still has a charge to come (active and not
// past its end date, as the Recurring card counts them) and it's income or an
// expense paid from income (savings.rowEffect): never a savings transfer,
// received savings, or an expense paid from savings or with meal vouchers.

import { rowEffect } from './savings.ts'

// deno-lint-ignore no-explicit-any
type Rule = any

export const isPlanRule = (rule: Rule, savingsIds: Set<string>): boolean =>
  !!rule?.is_active && (!rule.end_date || rule.next_run <= rule.end_date)
  && ['income', 'expense'].includes(rowEffect(rule, savingsIds))
