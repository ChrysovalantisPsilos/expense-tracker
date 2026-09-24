import { useEffect, useState } from 'react'
import { createLoaderClock } from './loaderTiming.js'

// The page's one loader clock (rules in loaderTiming.js).
const clock = createLoaderClock(() => performance.now())

// main.jsx calls this before React renders into `root`: when index.html's
// loading screen is up, the app's first loader takes over from it at once,
// with its ring in step (the CSS animation's start time is on the same clock
// as performance.now).
export function adoptBootLoader(root) {
  const screen = root.querySelector('.rl-screen')
  if (!screen) return
  const start = screen.querySelector('.rl-amber')?.getAnimations?.()[0]?.startTime
  clock.adoptBoot(start ?? null)
}

// For a loader that just mounted: `shown` turns true after the reveal delay
// (at once when it takes over from another loader — then `continued`).
// While shown, the loader counts as on screen for the next one.
export function useLoaderReveal() {
  const [delay] = useState(() => clock.revealDelay())
  const [shown, setShown] = useState(delay === 0)
  useEffect(() => {
    if (!shown) {
      const t = setTimeout(() => setShown(true), delay)
      return () => clearTimeout(t)
    }
    clock.shown()
    return () => clock.hidden()
  }, [shown, delay])
  return { shown, continued: delay === 0 }
}

// A full-screen ring's animation offset (ms), fixed when it first renders.
export function useRingPhase(continued) {
  const [phase] = useState(() => clock.ringPhase(continued))
  return phase
}
