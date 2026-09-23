import { distributeByWeights } from '../groups/splitMath.js'

// Rows for the "Spending by category" ranked-bar chart. Input is
// [{ name, value }] (minor units, any order). Keeps the `top` largest and folds
// the rest into "Other" (a real "Other" category merges into it), so a long
// tail never crowds a phone screen. "Other" is always the last row; when it
// holds folded-in categories it's marked `folded: true` (it's then several
// buckets, so it can't drill down to one). Each row gets:
//   share — integer percent of the total; shares sum to exactly 100
//   ratio — value relative to the largest row (0..1), the bar's length
export function categoryBars(categories, top = 5) {
  const sorted = categories.filter((c) => c.value > 0).sort((a, b) => b.value - a.value)
  let rows = sorted
  if (sorted.length > top + 1) {
    const rest = sorted.slice(top).reduce((sum, c) => sum + c.value, 0)
    rows = sorted.slice(0, top)
    const existing = rows.find((c) => c.name === 'Other')
    if (existing) rows = rows.map((c) => (c === existing ? { ...c, value: c.value + rest, folded: true } : c))
    else rows = [...rows, { name: 'Other', value: rest, folded: true }]
  }
  // "Other" is a leftover bucket, not a ranked category: always list it last.
  rows = [...rows.filter((c) => c.name !== 'Other'), ...rows.filter((c) => c.name === 'Other')]
  if (rows.length === 0) return []
  const shares = distributeByWeights(100, rows.map((c) => c.value))
  const max = Math.max(...rows.map((c) => c.value))
  return rows.map((c, i) => ({ ...c, share: shares[i], ratio: c.value / max }))
}
