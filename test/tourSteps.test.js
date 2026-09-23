import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { TOUR_STEPS } from '../src/features/onboarding/tourSteps.js'

// Every data-tour name the app's source marks up: literal attributes, plus
// the nav tables' `tour: '…'` fields (AppShell renders them as data-tour).
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

const stepsFor = (media) => TOUR_STEPS.filter((s) => !s.media || s.media === media)

test('tour: every step with a target points at an element the app marks up', () => {
  const names = tourNames(new URL('../src', import.meta.url).pathname)
  for (const s of TOUR_STEPS) {
    if (s.target) assert.ok(names.has(s.target), `no data-tour="${s.target}" in src (step ${s.id})`)
  }
})

test('tour: about ten stops on each layout, ending on a centred card', () => {
  for (const media of ['mobile', 'desktop']) {
    const steps = stepsFor(media)
    assert.ok(steps.length >= 9 && steps.length <= 11, `${media}: ${steps.length} steps`)
    assert.equal(new Set(steps.map((s) => s.id)).size, steps.length, `${media}: duplicate ids`)
    assert.equal(steps.at(-1).target, undefined)
    for (const s of steps) {
      assert.ok(s.title && s.body, `step ${s.id} needs a title and body`)
      if (s.route) assert.match(s.route, /^\//)
    }
  }
})

test('tour: covers Home’s Subscriptions card and Settings → Privacy', () => {
  const ids = TOUR_STEPS.map((s) => s.id)
  for (const id of ['overview', 'categories', 'subscriptions', 'add-expense', 'privacy']) assert.ok(ids.includes(id), id)
})
