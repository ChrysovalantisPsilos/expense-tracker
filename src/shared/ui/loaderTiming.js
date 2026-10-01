// When loaders appear, and how the loading ring keeps its rhythm. Pure; the
// React side is useLoaderReveal.js.
//
// Rules:
// - A loader (ring or skeleton) appears only once loading has taken
//   LOADER_DELAY_MS, so fast answers never flash one.
// - …unless it takes over from a loader that is on screen, or was until
//   HANDOVER_MS ago: then it appears at once, so nothing blinks out between
//   them (index.html's loader → the app's; a route's chunk → its skeleton).
// - A full-screen ring that takes over keeps the running ring's timing, so
//   the drawing carries on instead of starting again.

import { WORDMARK } from './markGeometry.js'

export const LOADER_DELAY_MS = 300
export const HANDOVER_MS = 200
// One draw of the ring (amber, coral, fade). The wordmark's pulse runs back
// and forth over two of them.
export const RING_CYCLE_MS = 1800

// The ring's motion over one draw, as fractions of RING_CYCLE_MS (ringLoader.js
// writes its keyframes from these; the native app samples ringFrame). Each
// arc grows over `draw`, holds until `fade`, then fades before the next
// draw; the stem stretches to `breathe` at mid-draw and back; the wordmark's
// opacity runs between `pulse`'s two values, one way per draw (CSS
// `alternate`). Every step eases in and out (CSS ease-in-out).
export const RING_MOTION = {
  amber: { draw: [0, 0.3], fade: 0.8 },
  coral: { draw: [0.25, 0.65], fade: 0.8 },
  breathe: 1.05,
  pulse: [0.55, 1],
}

// CSS's ease-in-out: cubic-bezier(.42, 0, .58, 1), solved for x by bisection.
const bezier = (a, b, t) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3
export function easeInOut(x) {
  if (x <= 0) return 0
  if (x >= 1) return 1
  let lo = 0
  let hi = 1
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    if (bezier(0.42, 0.58, mid) < x) lo = mid
    else hi = mid
  }
  return bezier(0, 1, (lo + hi) / 2)
}

// How far through [from, to] the draw is at `p`, eased (0 before, 1 after).
const span = (p, from, to) => easeInOut((p - from) / (to - from))
const round4 = (n) => Math.round(n * 10000) / 10000

// The loading ring `ms` into its animation: how much of each arc is drawn
// (0…1 of the arc), the ring's opacity, the stem's vertical scale and the
// wordmark's opacity — what the CSS keyframes show at that moment.
// `settle`: one draw that ends on the still, full mark (the native sign-in's
// intro): no fade, and the stem and the wordmark come to rest at 1.
export function ringFrame(ms, { settle = false } = {}) {
  const C = RING_CYCLE_MS
  const t = settle ? Math.min(Math.max(ms, 0), C) : ((ms % (2 * C)) + 2 * C) % (2 * C)
  const second = !settle && t >= C
  const p = settle && t === C ? 1 : (t % C) / C
  const { amber, coral, breathe, pulse } = RING_MOTION
  const opacity = settle || p < amber.fade ? 1 : 1 - span(p, amber.fade, 1)
  const stem = p <= 0.5 ? 1 + (breathe - 1) * span(p, 0, 0.5) : breathe - (breathe - 1) * span(p, 0.5, 1)
  const wordProgress = second ? 1 - easeInOut(p) : easeInOut(p)
  return {
    amber: round4(span(p, ...amber.draw)),
    coral: round4(span(p, ...coral.draw)),
    opacity: round4(opacity),
    stem: round4(stem),
    word: round4(pulse[0] + (pulse[1] - pulse[0]) * wordProgress),
  }
}

// `count` + 1 frames evenly over one draw (0 to RING_CYCLE_MS), for a player
// that steps through them (the native app's sign-in).
export function ringFrames(count, options) {
  const n = Math.max(1, Math.round(count))
  return Array.from({ length: n + 1 }, (_, i) => ringFrame((i / n) * RING_CYCLE_MS, options))
}

// Milliseconds to wait before showing a loader that mounts at `now`.
export function revealDelay({ now, lastSeen = null, onScreen = 0, bootPending = false }) {
  const continuing = bootPending || onScreen > 0 || (lastSeen != null && now - lastSeen <= HANDOVER_MS)
  return continuing ? 0 : LOADER_DELAY_MS
}

// The (negative) animation delay, in whole ms, that puts a ring shown at
// `now` in step with one that started at `epoch`.
export function ringPhase(now, epoch) {
  if (epoch == null || !(now >= epoch)) return 0
  const phase = Math.round((now - epoch) % (2 * RING_CYCLE_MS))
  return phase === 0 ? 0 : -phase
}

// The page's loader clock: what's on screen and when the ring started.
// `now` is a clock in ms (performance.now in the app).
export function createLoaderClock(now) {
  let epoch = null
  let lastSeen = null
  let onScreen = 0
  let bootPending = false
  return {
    // index.html's loader is on screen; its ring started at `startTime`
    // (null when unknown, e.g. under reduced motion).
    adoptBoot(startTime) {
      bootPending = true
      epoch = typeof startTime === 'number' ? startTime : now()
      lastSeen = now()
    },
    revealDelay: () => revealDelay({ now: now(), lastSeen, onScreen, bootPending }),
    shown() {
      bootPending = false
      onScreen += 1
    },
    hidden() {
      onScreen = Math.max(0, onScreen - 1)
      lastSeen = now()
    },
    // A full-screen ring appearing: in step with the running one when it
    // `continued` from it, else starting afresh.
    ringPhase(continued) {
      const t = now()
      if (!continued || epoch == null) epoch = t
      return ringPhase(t, epoch)
    },
  }
}

// The native sign-in's intro: the wordmark's text, how long one draw takes,
// and `count` + 1 frames of one draw that settles on the full mark.
export const ringIntro = (count) => ({
  wordmark: WORDMARK, cycleMs: RING_CYCLE_MS, frames: ringFrames(count, { settle: true }),
})
