// Breakdown and settle-up maths shared by the app and the report PDFs, so a
// statement ranks categories and plans payments exactly like the screens do.
// The client re-exports these (src/features/groups/splitMath.js,
// src/features/dashboard/categoryBars.js); tests import them from there.
// All money is integer minor units unless noted.

// Distribute `total` minor units across `weights` so the integer parts sum
// EXACTLY to total (largest-remainder / Hamilton apportionment). Used for
// percentage and share splits where the raw division leaves fractional cents.
export function distributeByWeights(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0)
  if (sum <= 0) return weights.map(() => 0)
  const raw = weights.map((w) => (total * w) / sum)
  const out = raw.map((x) => Math.floor(x))
  let rem = total - out.reduce((a, b) => a + b, 0)
  // Hand the leftover units to the largest fractional remainders first.
  const order = raw
    .map((x, i) => [x - Math.floor(x), i])
    .sort((a, b) => b[0] - a[0])
  for (let k = 0; rem > 0 && k < order.length; k++, rem--) out[order[k][1]] += 1
  return out
}

// Minimal-ish settlement plan from net balances (positive = is owed, negative =
// owes). Greedy: repeatedly match the biggest creditor with the biggest debtor.
// Produces at most n-1 transfers. `net` is a Map or array of [id, minor].
export function simplifyDebts<K>(net: ReadonlyMap<K, number | string> | [K, number | string][]) {
  const entries = Array.isArray(net) ? net : [...net.entries()]
  const creditors: { id: K; amt: number }[] = []
  const debtors: { id: K; amt: number }[] = []
  for (const [id, v] of entries) {
    const n = Number(v)
    if (n > 0) creditors.push({ id, amt: n })
    else if (n < 0) debtors.push({ id, amt: -n })
  }
  creditors.sort((a, b) => b.amt - a.amt)
  debtors.sort((a, b) => b.amt - a.amt)

  const transfers: { from: K; to: K; amount: number }[] = []
  let ci = 0
  let di = 0
  while (ci < creditors.length && di < debtors.length) {
    const c = creditors[ci]
    const d = debtors[di]
    const x = Math.min(c.amt, d.amt)
    if (x > 0) transfers.push({ from: d.id, to: c.id, amount: x })
    c.amt -= x
    d.amt -= x
    if (c.amt === 0) ci++
    if (d.amt === 0) di++
  }
  return transfers // each: { from (owes) , to (is owed), amount }
}

export interface CategoryBar {
  name: string
  value: number
  folded?: boolean
  share: number
  ratio: number
}

// Rows for the "Spending by category" ranked-bar chart. Input is
// [{ name, value }] (minor units, any order). Keeps the `top` largest and folds
// the rest into "Other" (a real "Other" category merges into it), so a long
// tail never crowds a phone screen. "Other" is always the last row; when it
// holds folded-in categories it's marked `folded: true` (it's then several
// buckets, so it can't drill down to one). Each row gets:
//   share — integer percent of the total; shares sum to exactly 100
//   ratio — value relative to the largest row (0..1), the bar's length
export function categoryBars<T extends { name: string; value: number }>(
  categories: T[], top = 5,
): (T & CategoryBar)[] {
  const sorted = categories.filter((c) => c.value > 0).sort((a, b) => b.value - a.value)
  let rows: (T & { folded?: boolean })[] = sorted
  if (sorted.length > top + 1) {
    const rest = sorted.slice(top).reduce((sum, c) => sum + c.value, 0)
    rows = sorted.slice(0, top)
    const existing = rows.find((c) => c.name === 'Other')
    if (existing) rows = rows.map((c) => (c === existing ? { ...c, value: c.value + rest, folded: true } : c))
    else rows = [...rows, { name: 'Other', value: rest, folded: true } as T & { folded: boolean }]
  }
  // "Other" is a leftover bucket, not a ranked category: always list it last.
  rows = [...rows.filter((c) => c.name !== 'Other'), ...rows.filter((c) => c.name === 'Other')]
  if (rows.length === 0) return []
  const shares = distributeByWeights(100, rows.map((c) => c.value))
  const max = Math.max(...rows.map((c) => c.value))
  return rows.map((c, i) => ({ ...c, share: shares[i], ratio: c.value / max }))
}
