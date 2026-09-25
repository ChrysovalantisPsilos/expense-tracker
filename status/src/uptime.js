// Daily rollups and uptime maths (pure).
//
// Uptime counts every check whose state was known and not planned
// maintenance: working and slow count as up (Budgeer worked, just slowly);
// partial and down count as down. Maintenance and "unknown" (couldn't check)
// don't count either way.
import { worse } from './state.js'

const DAY = 86400000
const UP = new Set(['working', 'slow'])
const COUNTED = new Set(['working', 'slow', 'partial', 'down'])

export const dayKey = (t) => new Date(t).toISOString().slice(0, 10)
export const addDays = (key, n) => dayKey(Date.parse(`${key}T00:00:00Z`) + n * DAY)

// A day's row after one more check.
export function mergeDay(prev, state) {
  const row = prev ? { ...prev } : { ok: 0, total: 0, worst: 'unknown' }
  if (COUNTED.has(state)) {
    row.total += 1
    if (UP.has(state)) row.ok += 1
  }
  row.worst = worse(row.worst, state)
  return row
}

// Percentage (0–100) over rows, or null when nothing counted.
export function uptimePct(rows) {
  let ok = 0, total = 0
  for (const r of rows) { ok += r.ok; total += r.total }
  return total ? (ok / total) * 100 : null
}

// "100%", or two decimals rounded DOWN so a bad day never shows as 100%.
export function formatPct(p) {
  if (p === null || p === undefined) return '—'
  if (p >= 100) return '100%'
  return `${(Math.floor(p * 100) / 100).toFixed(2)}%`
}

const BAR_CLASS = { working: '', slow: 'degraded', partial: 'partial', down: 'down', maint: 'maint', unknown: 'none' }
const BAR_WORDS = { working: 'No problems', slow: 'Slower than usual', partial: 'Partly down', down: 'Not working', maint: 'Planned maintenance', unknown: 'No data' }

// The last `days` days up to `todayKey`, oldest first: { day, cls, words }.
export function dayBars(rows, todayKey, days) {
  const byDay = new Map(rows.map((r) => [r.day, r.worst]))
  const out = []
  for (let i = days - 1; i >= 0; i--) {
    const day = addDays(todayKey, -i)
    const worst = byDay.get(day) || 'unknown'
    out.push({ day, cls: BAR_CLASS[worst] ?? 'none', words: BAR_WORDS[worst] ?? BAR_WORDS.unknown })
  }
  return out
}
