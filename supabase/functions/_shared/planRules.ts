// Which recurring rules Plan mode shows and counts (pure, no I/O). One copy
// for the app (src/features/plan/planMath.planRules) and the ai-helper edge
// function's "What-if in your own words", which offers the model the same
// payments, income and savings the plan lists.
//
// A rule is in the plan when it still has a charge to come (active and not
// past its end date, as the Recurring card counts them) and it moves the net
// (savings.rowEffect / netSign): income, an expense paid from income, or
// savings taken from income (money set aside on payday lowers what's left,
// exactly like Home's net). Never received savings (a gift, interest), or an
// expense paid from savings or with meal vouchers: those leave the net alone.
//
// planKindOf says what the row is in the plan: 'income', 'expense', or
// 'savings' (a rule that's income in the database, but money going out of
// the month).

import { rowEffect } from './savings.ts'

// deno-lint-ignore no-explicit-any
type Rule = any

export type PlanKind = 'income' | 'expense' | 'savings'

const KINDS: Record<string, PlanKind> = { income: 'income', expense: 'expense', 'saved-from-income': 'savings' }

// What a rule is in the plan, or null when the plan leaves it out.
export const planKindOf = (rule: Rule, savingsIds: Set<string>): PlanKind | null =>
  KINDS[rowEffect(rule, savingsIds)] ?? null

export const isPlanRule = (rule: Rule, savingsIds: Set<string>): boolean =>
  !!rule?.is_active && (!rule.end_date || rule.next_run <= rule.end_date) && planKindOf(rule, savingsIds) !== null
