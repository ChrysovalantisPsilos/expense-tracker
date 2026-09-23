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

// ---- Rollover (the same rule as SQL budget_source_period / my_budgets) -----
// A month without budgets of its own uses the most recent earlier month's
// caps. my_budgets returns that month's rows, so their period_start says
// where they came from.

// The first day of the month before `periodStart` ('YYYY-MM-01').
export function previousPeriod(periodStart) {
  const [y, m] = periodStart.split('-').map(Number)
  return m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, '0')}-01`
}

// The month this month's caps were carried over from ('YYYY-MM-01'), or null
// when the month has its own budgets (or none at all).
export function carriedFrom(rows, periodStart) {
  if (!rows?.length) return null
  const src = rows[0].period_start
  return src && src < periodStart ? src : null
}

// "Carried over from August" (the year is added when it isn't this one's).
export function carriedLabel(source, periodStart, locale = undefined) {
  const [y, m] = source.split('-').map(Number)
  const month = new Date(Date.UTC(y, m - 1, 1)).toLocaleString(locale, {
    month: 'long', timeZone: 'UTC', ...(periodStart.slice(0, 4) !== source.slice(0, 4) ? { year: 'numeric' } : {}),
  })
  return `Carried over from ${month}`
}
