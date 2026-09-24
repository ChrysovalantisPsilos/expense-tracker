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

export const LOADER_DELAY_MS = 300
export const HANDOVER_MS = 200
// One draw of the ring (amber, coral, fade). The wordmark's pulse runs back
// and forth over two of them.
export const RING_CYCLE_MS = 1800

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
