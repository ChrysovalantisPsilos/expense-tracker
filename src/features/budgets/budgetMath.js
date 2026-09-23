// Pure budget helpers (no I/O) — unit-tested in test/budgetMath.test.js.

// How close spend is to its cap, as the tone its progress bar takes (the
// theme's Progress variants): 'negative' once over the cap, 'warning' from 80%
// of it, otherwise undefined (the default brand fill). Minor units in.
export function budgetTone(spent, limit) {
  if (spent > limit) return 'negative'
  if (limit > 0 && spent >= limit * 0.8) return 'warning'
  return undefined
}

// Spend as a whole percent of the cap, for a budget row's label and bar
// ("78%"). Not clamped (the bar clamps itself); a zero cap reads 0% — the
// row's over-budget state comes from budgetTone, not from this number.
export function budgetPercent(spent, limit) {
  return limit > 0 ? Math.round((spent / limit) * 100) : 0
}
