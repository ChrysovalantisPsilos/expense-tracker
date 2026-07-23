import { isoDate } from '../../shared/lib/dates.js'

// Dashboard period options, clamped so the user never sees months/years from
// before they have any data. The range spans from `oldestISO` (their oldest
// transaction, YYYY-MM-DD) up to now — importing older data extends it for
// free. With no transactions, only "This month" is offered. Pure module (no
// React/supabase) so it's unit-testable.
export function buildPeriods(oldestISO, d = new Date()) {
  const iso = isoDate
  const y = d.getFullYear()
  const m = d.getMonth()

  const thisMonth = {
    value: `m:${y}-${m + 1}`, label: 'This month',
    from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)),
  }
  if (!oldestISO) return [thisMonth]

  const oldest = new Date(oldestISO)
  const oldestY = oldest.getFullYear()
  const oldestMonthIdx = oldestY * 12 + oldest.getMonth()
  const nowMonthIdx = y * 12 + m

  const out = []
  for (let idx = nowMonthIdx; idx >= oldestMonthIdx; idx--) {
    const start = new Date(Math.floor(idx / 12), idx % 12, 1)
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0)
    out.push({
      value: `m:${start.getFullYear()}-${start.getMonth() + 1}`,
      label: idx === nowMonthIdx ? 'This month' : start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      from: iso(start), to: iso(end),
    })
  }
  // Future-dated data can leave the months loop empty (oldest is after now):
  // "This month" must always exist — it's the default selection and callers
  // index into the list.
  if (!out.some((p) => p.value === thisMonth.value)) out.unshift(thisMonth)
  for (let yr = y; yr >= oldestY; yr--) {
    out.push({ value: `y:${yr}`, label: yr === y ? 'This year' : String(yr), from: `${yr}-01-01`, to: `${yr}-12-31` })
  }
  // "All time" only adds value once there's data spanning more than this month.
  if (oldestMonthIdx < nowMonthIdx) out.push({ value: 'all', label: 'All time', from: null, to: null })
  return out
}
