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

import { toBaseMinor } from './money.ts'

// deno-lint-ignore no-explicit-any
type Row = any

export type Effect = 'income' | 'expense' | 'saved-from-income' | 'saved-received'

// The ids of the user's savings categories (income ones marked is_savings).
export function savingsIdsOf(categories: Row[] | null | undefined): Set<string> {
  return new Set((categories ?? []).filter((c) => c?.is_savings === true && c.kind === 'income').map((c) => c.id))
}

// Is this transaction (or recurring rule) a savings entry?
export const isSavingsRow = (row: Row, savingsIds: Set<string>): boolean =>
  row?.kind === 'income' && !!row.category_id && savingsIds.has(row.category_id)

// What a transaction (or recurring rule) is to the totals: income, an
// expense (anything that isn't income, as everywhere else), or savings —
// taken from income or received.
export function rowEffect(row: Row, savingsIds: Set<string>): Effect {
  if (row?.kind !== 'income') return 'expense'
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

// How an effect moves the net: income adds, expenses and savings taken from
// income take away, received savings leave it alone.
export const netSign = (effect: Effect): number =>
  (effect === 'income' ? 1 : effect === 'saved-received' ? 0 : -1)

// The rows without the savings entries (the same array when there are none).
export const withoutSavings = (rows: Row[], savingsIds: Set<string>): Row[] =>
  (savingsIds.size ? rows.filter((r) => !isSavingsRow(r, savingsIds)) : rows)

// What the savings entries among `rows` add up to — both kinds — in
// base-currency minor units at each entry's captured exchange rate.
export const savedMinor = (rows: Row[], savingsIds: Set<string>, baseCurrency: string): number =>
  rows.reduce((sum, r) => (isSavingsRow(r, savingsIds)
    ? sum + toBaseMinor(r.amount_minor, r.exchange_rate, r.currency, baseCurrency)
    : sum), 0)
