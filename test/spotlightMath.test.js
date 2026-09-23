import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  stepsFor, moveStep, indexAfterMissing, spotlightRect, fullyVisible, placePopover,
} from '../src/shared/ui/spotlightMath.js'
import { TOUR_STEPS } from '../src/features/onboarding/tourSteps.js'

const STEPS = [
  { id: 'a' },
  { id: 'b', media: 'mobile' },
  { id: 'b', media: 'desktop' },
  { id: 'c' },
  { id: 'd', media: 'desktop' },
]
const vp = { width: 390, height: 844 }
const size = { width: 300, height: 150 }

test('stepsFor: keeps steps for this viewport and drops missing targets', () => {
  assert.deepEqual(stepsFor(STEPS, { desktop: false }).map((s) => `${s.id}${s.media ?? ''}`), ['a', 'bmobile', 'c'])
  assert.deepEqual(stepsFor(STEPS, { desktop: true }).map((s) => `${s.id}${s.media ?? ''}`), ['a', 'bdesktop', 'c', 'ddesktop'])
  assert.deepEqual(stepsFor(STEPS, { desktop: true, missing: new Set(['b', 'd']) }).map((s) => s.id), ['a', 'c'])
  assert.deepEqual(stepsFor([], { desktop: false }), [])
})

test('moveStep: Next ends past the last step, Back stops at the first', () => {
  assert.equal(moveStep(0, 1, 3), 1)
  assert.equal(moveStep(1, 1, 3), 2)
  assert.equal(moveStep(2, 1, 3), null)
  assert.equal(moveStep(2, -1, 3), 1)
  assert.equal(moveStep(0, -1, 3), 0)
  assert.equal(moveStep(0, 1, 1), null)
})

test('indexAfterMissing: forward keeps the slot, back steps before it', () => {
  // [a, X, c] and X is missing → [a, c]
  assert.equal(indexAfterMissing(1, 1, 2), 1) // forward lands on c
  assert.equal(indexAfterMissing(1, -1, 2), 0) // back lands on a
  assert.equal(indexAfterMissing(0, -1, 2), 0) // never below the first
  assert.equal(indexAfterMissing(2, 1, 2), 1) // the last one missing → the new last
  assert.equal(indexAfterMissing(0, 1, 0), null) // nothing left
})

test('spotlightRect: pads the target and clamps it to the viewport', () => {
  assert.deepEqual(spotlightRect({ top: 100, left: 20, width: 50, height: 40 }, vp), { top: 94, left: 14, width: 62, height: 52 })
  assert.deepEqual(spotlightRect({ top: 2, left: 0, width: 390, height: 60 }, vp, 8), { top: 0, left: 0, width: 390, height: 70 })
  assert.deepEqual(spotlightRect({ top: 790, left: 300, width: 90, height: 54 }, vp, 6), { top: 784, left: 294, width: 96, height: 60 })
})

test('fullyVisible', () => {
  assert.equal(fullyVisible({ top: 10, left: 10, width: 100, height: 100 }, vp), true)
  assert.equal(fullyVisible({ top: -5, left: 10, width: 100, height: 100 }, vp), false)
  assert.equal(fullyVisible({ top: 800, left: 10, width: 100, height: 100 }, vp), false)
  assert.equal(fullyVisible({ top: 10, left: 300, width: 100, height: 100 }, vp), false)
})

test('placePopover: centred with no target', () => {
  assert.deepEqual(placePopover({ target: null, size, viewport: vp }), { placement: 'center', top: 347, left: 45 })
})

test('placePopover: below when there is room, centred on the target and clamped', () => {
  const p = placePopover({ target: { top: 80, left: 20, width: 100, height: 40 }, size, viewport: vp })
  assert.equal(p.placement, 'bottom')
  assert.equal(p.top, 132) // 80 + 40 + 12
  assert.equal(p.left, 12) // centre would be -80: clamped to the margin
})

test('placePopover: above a bottom-bar tab (no room below)', () => {
  const p = placePopover({ target: { top: 784, left: 150, width: 70, height: 56 }, size, viewport: vp })
  assert.equal(p.placement, 'top')
  assert.equal(p.top, 784 - 12 - 150)
  assert.equal(p.left, 35) // centred on the tab: 185 - 150
})

test('placePopover: right of a tall sidebar item when top/bottom are full', () => {
  const desk = { width: 1280, height: 800 }
  const p = placePopover({ target: { top: 20, left: 10, width: 220, height: 760 }, size, viewport: desk })
  assert.equal(p.placement, 'right')
  assert.equal(p.left, 242)
  assert.equal(p.top, 325) // 20 + 380 - 75
})

test('placePopover: a side-first preference still lands above a phone tab bar', () => {
  const p = placePopover({ target: { top: 784, left: 300, width: 90, height: 56 }, size, viewport: vp,
    prefer: ['right', 'bottom', 'top'] })
  assert.equal(p.placement, 'top')
  assert.equal(p.left, 78) // centred would overflow the right edge: clamped to 390 - 300 - 12
})

test('placePopover: honours `prefer`, and falls back to the roomiest side', () => {
  const t = { top: 300, left: 400, width: 100, height: 40 }
  const desk = { width: 1280, height: 800 }
  assert.equal(placePopover({ target: t, size, viewport: desk, prefer: ['left', 'bottom'] }).placement, 'left')
  // Nothing fits in a tiny viewport: still on screen.
  const tiny = placePopover({ target: { top: 50, left: 50, width: 200, height: 150 }, size, viewport: { width: 320, height: 260 } })
  assert.ok(tiny.top >= 12 && tiny.left >= 12)
})

test('TOUR_STEPS: well formed, and each viewport gets a sensible tour', () => {
  for (const s of TOUR_STEPS) {
    assert.ok(s.id && s.title && s.body, `step ${s.id} has id, title and body`)
    assert.ok(!s.media || ['mobile', 'desktop'].includes(s.media))
    assert.ok(!s.route || s.route.startsWith('/'))
    assert.ok(!s.prefer || s.prefer.every((p) => ['top', 'bottom', 'left', 'right'].includes(p)))
  }
  for (const desktop of [false, true]) {
    const steps = stepsFor(TOUR_STEPS, { desktop })
    const ids = steps.map((s) => s.id)
    assert.equal(new Set(ids).size, ids.length, 'one step per id on each viewport')
    assert.equal(steps.at(-1).target, undefined, 'ends on a centred card')
    assert.ok(steps.slice(0, -1).every((s) => s.target), 'every other stop points at something')
    assert.deepEqual(ids, ['overview', 'categories', 'transactions', 'add-expense', 'search',
      'groups', 'budgets', 'more', 'account', 'done'])
  }
})
