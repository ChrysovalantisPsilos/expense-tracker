// Pure maths behind the financial statement (generate-report). Unit-tested in
// test/statementMath.test.js (Node strips the types).
import { minorFactor } from '../_shared/money.ts'

// One statement line. `base_amount` is in the base currency (major units),
// or null while the row's exchange rate is pending.
export interface StatementRow {
  date: string
  kind: string
  category: string
  description: string
  currency: string
  amount: number
  base_amount: number | null
}

export interface Statement {
  rows: StatementRow[] // oldest first
  totalSpent: number
  totalIncome: number
  byCategory: Record<string, number>
  // Rows left out of every total: foreign amounts whose rate is still pending.
  pending: { count: number; currencies: string[] }
}

// Build the statement from my_transactions rows (newest first, as the RPC
// returns them). A foreign row with exchange_rate NULL is "pending": the
// server rates it from its ECB cache (fx_sync, every few minutes) as soon as
// the cache covers its date, so a row still NULL here is one the cache can't
// rate yet. It is never summed as if it were already in the base currency (or
// as 0): it is listed with no base amount and reported under `pending`.
export function buildStatement(txns: any[], base: string): Statement {
  let count = 0
  const currencies = new Set<string>()
  const rows: StatementRow[] = txns.slice().reverse().map((t) => {
    const sf = minorFactor(t.currency)
    // Mirrored group expenses bucket under their group's name; everything else
    // uses its category (matching the in-app breakdown).
    const category = t.group_expense_id
      ? (t.group_expenses?.groups?.name ?? 'Group')
      : (t.categories?.name ?? 'Uncategorized')
    const rate = t.exchange_rate == null
      ? (t.currency === base ? 1 : null)
      : Number(t.exchange_rate)
    if (rate == null) {
      count += 1
      currencies.add(t.currency)
    }
    return {
      date: t.spent_at,
      kind: t.kind,
      category,
      description: t.description ?? '',
      currency: t.currency,
      amount: t.amount_minor / sf,
      // rate is major-per-major, so divide source minor by its own factor first.
      base_amount: rate == null ? null : (t.amount_minor / sf) * rate,
    }
  })

  const rated = rows.filter((r) => r.base_amount != null)
  const sum = (kind: string) => rated.filter((r) => r.kind === kind)
    .reduce((s, r) => s + (r.base_amount as number), 0)
  const byCategory: Record<string, number> = {}
  for (const r of rated.filter((r) => r.kind === 'expense')) {
    byCategory[r.category] = (byCategory[r.category] ?? 0) + (r.base_amount as number)
  }
  return {
    rows, totalSpent: sum('expense'), totalIncome: sum('income'), byCategory,
    pending: { count, currencies: [...currencies].sort() },
  }
}

// "2 transactions in GBP, JPY await an exchange rate and aren't in the
// totals." — or null when nothing is pending. Short: it's one PDF line.
export function pendingNote({ count, currencies }: Statement['pending']): string | null {
  if (count === 0) return null
  const [what, verb, isnt] = count === 1
    ? ['1 transaction', 'awaits', 'isn’t']
    : [`${count} transactions`, 'await', 'aren’t']
  return `${what} in ${currencies.join(', ')} ${verb} an exchange rate and ${isnt} in the totals.`
}
