// Savings entries (pure, no I/O). One copy for the client and the edge
// functions: src/shared/lib/savings.js re-exports this module, and
// generate-report's statement imports it, so the app's figures and the
// PDF/Excel statement treat the same entries the same way.
//
// The rule (0084): an INCOME entry in a category the user marked as savings
// (categories.is_savings) — money set aside, or money arriving in a savings
// account (interest, deposits) — is recorded as income but never counts as
// income. Every income sum (Home, Insights, the ledger's net, the recurring
// projections, the statement) leaves it out, and it's shown as "Saved"
// instead. Expenses are never savings (the CHECK allows is_savings on income
// categories only), and an entry with no category isn't either.
//
// Each savings entry says where the money came from (savings_from_income on
// the transaction or recurring rule): "Taken from my income" lowers the net
// (net = income − expenses − savings taken from income); received money (a
// gift, interest) leaves the net as it is. Either way it's saved: it counts in
// the "Saved" figures and in net worth's Savings line. rowEffect is the one
// place that decides; netSign says how each effect moves the net.
//
// The rows don't carry the category's flag (my_transactions and
// my_recurring_rules embed only its name/icon/colour), so it's derived from
// the user's own categories: savingsIdsOf(categories) once, then per row.
// Archived categories count too — their entries are still savings.
//
// An EXPENSE can be "Paid from savings" (paid_from_savings, 0085): money taken
// out of the pot, not out of this period's income. It's still spending
// everywhere spending is counted (Home's Spent, spending by category,
// budgets, Insights, the statement), but it doesn't lower the net, and it
// takes away from net worth's Savings line. The flag is on the row itself, so
// it doesn't depend on the savings categories.

import { toBaseMinor } from './money.ts'

// deno-lint-ignore no-explicit-any
type Row = any

export type Effect = 'income' | 'expense' | 'expense-from-savings' | 'saved-from-income' | 'saved-received'

// Every effect, for sums keyed by effect.
export const EFFECTS: readonly Effect[] = ['income', 'expense', 'expense-from-savings', 'saved-from-income', 'saved-received']

// The ids of the user's savings categories (income ones marked is_savings).
export function savingsIdsOf(categories: Row[] | null | undefined): Set<string> {
  return new Set((categories ?? []).filter((c) => c?.is_savings === true && c.kind === 'income').map((c) => c.id))
}

// Is this transaction (or recurring rule) a savings entry?
export const isSavingsRow = (row: Row, savingsIds: Set<string>): boolean =>
  row?.kind === 'income' && !!row.category_id && savingsIds.has(row.category_id)

// What a transaction (or recurring rule) is to the totals: income, an
// expense (anything that isn't income, as everywhere else) — paid from
// income or from savings — or savings, taken from income or received.
export function rowEffect(row: Row, savingsIds: Set<string>): Effect {
  if (row?.kind !== 'income') return row?.paid_from_savings === true ? 'expense-from-savings' : 'expense'
  if (!isSavingsRow(row, savingsIds)) return 'income'
  return row.savings_from_income === true ? 'saved-from-income' : 'saved-received'
}

// Where a savings entry's money came from, as the lists word it ("from
// income" / "received": the app's row note, the statement's Type column), or
// null for anything that isn't savings.
export function savingsSource(row: Row, savingsIds: Set<string>): 'from income' | 'received' | null {
  const effect = rowEffect(row, savingsIds)
  return effect === 'saved-from-income' ? 'from income' : effect === 'saved-received' ? 'received' : null
}

// The lists' note on a row that touches savings: where a savings entry's
// money came from, or "from savings" on an expense paid from savings; null
// otherwise.
export const savingsNoteOf = (row: Row, savingsIds: Set<string>): string | null =>
  savingsSource(row, savingsIds) ?? (rowEffect(row, savingsIds) === 'expense-from-savings' ? 'from savings' : null)

// Is it spending? Every expense is, whatever paid for it.
export const isSpending = (effect: Effect): boolean => effect === 'expense' || effect === 'expense-from-savings'

// How an effect moves the net: income adds, expenses paid from income and
// savings taken from income take away; received savings and expenses paid
// from savings leave it alone.
export const netSign = (effect: Effect): number =>
  (effect === 'income' ? 1 : effect === 'saved-received' || effect === 'expense-from-savings' ? 0 : -1)

// How an effect moves the savings pot (net worth's Savings line): every
// savings entry adds, an expense paid from savings takes away.
export const potSign = (effect: Effect): number =>
  (effect === 'saved-from-income' || effect === 'saved-received' ? 1 : effect === 'expense-from-savings' ? -1 : 0)

// The savings pot across `rows`: the savings entries (both kinds) minus the
// expenses paid from savings, in base-currency minor units at each row's
// captured exchange rate. It can be negative (more paid from savings than
// recorded going in).
export const savingsPotMinor = (rows: Row[], savingsIds: Set<string>, baseCurrency: string): number =>
  rows.reduce((sum, r) => sum
    + potSign(rowEffect(r, savingsIds)) * toBaseMinor(r.amount_minor, r.exchange_rate, r.currency, baseCurrency), 0)
