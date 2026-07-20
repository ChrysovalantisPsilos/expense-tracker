// Pure helpers for shared-expense splitting and debt simplification.
// All money is integer minor units.

// Distribute `total` minor units across `weights` so the integer parts sum
// EXACTLY to total (largest-remainder / Hamilton apportionment). Used for
// percentage and share splits where the raw division leaves fractional cents.
export function distributeByWeights(total, weights) {
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

// Split `total` equally across `count` people, giving the leftover cents to the
// earliest people (matches the SQL split_equally so preview == server).
export function splitEqually(total, count) {
  if (count <= 0) return []
  const base = Math.trunc(total / count)
  const rem = total - base * count
  return Array.from({ length: count }, (_, i) => base + (i < rem ? 1 : 0))
}

// Minimal-ish settlement plan from net balances (positive = is owed, negative =
// owes). Greedy: repeatedly match the biggest creditor with the biggest debtor.
// Produces at most n-1 transfers. `net` is a Map or array of [id, minor].
export function simplifyDebts(net) {
  const entries = net instanceof Map ? [...net.entries()] : net
  const creditors = []
  const debtors = []
  for (const [id, v] of entries) {
    const n = Number(v)
    if (n > 0) creditors.push({ id, amt: n })
    else if (n < 0) debtors.push({ id, amt: -n })
  }
  creditors.sort((a, b) => b.amt - a.amt)
  debtors.sort((a, b) => b.amt - a.amt)

  const transfers = []
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
