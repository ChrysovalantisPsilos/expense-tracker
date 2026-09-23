import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { TOUR_STEPS } from '../src/features/onboarding/tourSteps.js'

// The step list's shape is checked in spotlightMath.test.js; this checks its
// targets still exist. Every data-tour name the app's source marks up:
// literal attributes, plus the nav tables' `tour: '…'` fields (AppShell
// renders them as data-tour).
function tourNames(dir) {
  const names = new Set()
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) { for (const n of tourNames(p)) names.add(n); continue }
    if (!/\.jsx?$/.test(f) || p.includes('onboarding')) continue
    const src = readFileSync(p, 'utf8')
    for (const m of src.matchAll(/data-tour="([a-z-]+)"/g)) names.add(m[1])
    for (const m of src.matchAll(/\btour: '([a-z-]+)'/g)) names.add(m[1])
  }
  return names
}

test('tour: every step with a target points at an element the app marks up', () => {
  const names = tourNames(new URL('../src', import.meta.url).pathname)
  for (const s of TOUR_STEPS) {
    if (s.target) assert.ok(names.has(s.target), `no data-tour="${s.target}" in src (step ${s.id})`)
  }
})
