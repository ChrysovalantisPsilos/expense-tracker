// Status page: daily rollups and uptime percentages.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dayKey, addDays, mergeDay, uptimePct, formatPct, dayBars } from '../status/src/uptime.js'

test('dayKey / addDays in UTC across month and year ends', () => {
  assert.equal(dayKey(Date.parse('2026-09-25T23:59:59Z')), '2026-09-25')
  assert.equal(addDays('2026-09-30', 1), '2026-10-01')
  assert.equal(addDays('2027-01-01', -1), '2026-12-31')
  assert.equal(addDays('2026-09-25', -89), '2026-06-28')
})

test('mergeDay: counts up/down checks, skips maintenance and unknown, keeps the worst', () => {
  let row = null
  for (const s of ['working', 'working', 'slow', 'unknown', 'maint']) row = mergeDay(row, s)
  assert.deepEqual(row, { ok: 3, total: 3, worst: 'slow' })
  row = mergeDay(row, 'down')
  assert.deepEqual(row, { ok: 3, total: 4, worst: 'down' })
  row = mergeDay(row, 'working')
  assert.equal(row.worst, 'down')
  assert.deepEqual(mergeDay(null, 'partial'), { ok: 0, total: 1, worst: 'partial' })
  assert.deepEqual(mergeDay(null, 'unknown'), { ok: 0, total: 0, worst: 'unknown' })
  const prev = { ok: 1, total: 1, worst: 'working' }
  mergeDay(prev, 'down')
  assert.deepEqual(prev, { ok: 1, total: 1, worst: 'working' }, 'input row not mutated')
})

test('uptimePct and formatPct', () => {
  assert.equal(uptimePct([]), null)
  assert.equal(uptimePct([{ ok: 0, total: 0 }]), null)
  assert.equal(uptimePct([{ ok: 144, total: 144 }, { ok: 143, total: 144 }]), (287 / 288) * 100)
  assert.equal(formatPct(null), '—')
  assert.equal(formatPct(100), '100%')
  assert.equal(formatPct((287 / 288) * 100), '99.65%')
  assert.equal(formatPct(99.999), '99.99%', 'rounds down, never up to 100%')
  assert.equal(formatPct(0), '0.00%')
})

test('dayBars: oldest first, missing days show as no data', () => {
  const bars = dayBars([
    { day: '2026-09-25', worst: 'slow' },
    { day: '2026-09-23', worst: 'working' },
    { day: '2026-09-22', worst: 'maint' },
  ], '2026-09-25', 4)
  assert.deepEqual(bars.map((b) => [b.day, b.cls]), [
    ['2026-09-22', 'maint'], ['2026-09-23', ''], ['2026-09-24', 'none'], ['2026-09-25', 'degraded'],
  ])
  assert.equal(bars[3].words, 'Slower than usual')
  assert.equal(dayBars([], '2026-09-25', 30).length, 30)
})
